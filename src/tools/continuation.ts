import { fromUniversal } from "../models"
import { ProviderType } from "../types/providers"
import { UniversalBody } from "../types/universal"
import { NormalizedToolCall } from "./extractor"

/**
 * Build clean headers for LLM continuation requests
 * Filters out hop-by-hop headers and includes only provider-specific auth headers
 * to avoid "content-length", "host", and other problematic header forwarding
 */
export function buildContinuationHeaders(
  provider: ProviderType,
  headers: Record<string, string>
): Record<string, string> {
  const baseHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json",
  }

  // Provider-specific auth headers
  if (provider === "openai") {
    const authHeader = headers.authorization || headers.Authorization
    const orgHeader = headers["OpenAI-Organization"] || headers["openai-organization"]
    return {
      ...baseHeaders,
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(orgHeader ? { "OpenAI-Organization": orgHeader } : {}),
    }
  }

  if (provider === "anthropic") {
    const apiKey = headers["x-api-key"]
    const version = headers["anthropic-version"]
    return {
      ...baseHeaders,
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      ...(version ? { "anthropic-version": version } : {}),
    }
  }

  if (provider === "google") {
    // Google/Gemini uses x-goog-api-key header or API key in URL
    const apiKey = headers["x-goog-api-key"]
    const authHeader = headers.authorization || headers.Authorization
    return {
      ...baseHeaders,
      ...(apiKey ? { "x-goog-api-key": apiKey } : {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
    }
  }

  // Fallback: include common auth headers
  return {
    ...baseHeaders,
    ...(headers.authorization ? { Authorization: headers.authorization } : {}),
    ...(headers.Authorization ? { Authorization: headers.Authorization } : {}),
  }
}

/**
 * Build continuation request with tool results
 * Handles provider-specific formatting for tool calls and results
 */
export async function buildContinuationRequest(
  provider: ProviderType,
  originalBody: any,
  originalUniversal: UniversalBody,
  toolCall: NormalizedToolCall,
  toolResult: any,
  responseJson: any
): Promise<any> {
  if (provider === "openai") {
    // OpenAI requires specific format
    const messages = [...(originalBody.messages || [])]

    // Add assistant message with tool call
    messages.push({
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.input),
          },
        },
      ],
    })

    // Add tool result message
    messages.push({
      role: "tool",
      content: JSON.stringify(toolResult),
      tool_call_id: toolCall.id,
    })

    // Build continuation body, ensuring model is preserved
    const continuationBody: any = {
      model: originalBody.model,
      messages,
      stream: originalBody.stream,
      temperature: originalBody.temperature,
      max_tokens: originalBody.max_tokens,
      top_p: originalBody.top_p,
      frequency_penalty: originalBody.frequency_penalty,
      presence_penalty: originalBody.presence_penalty,
      n: originalBody.n,
      stop: originalBody.stop,
    }

    // Copy any other properties from original body (but not tools)
    Object.keys(originalBody).forEach((key) => {
      if (key !== "tools" && key !== "messages" && !(key in continuationBody)) {
        continuationBody[key] = originalBody[key]
      }
    })

    // Final validation - ensure model is actually in the object
    if (!continuationBody.model) {
      console.error("[LLM BRIDGE] ERROR: model is missing from continuationBody!")
      continuationBody.model = originalBody.model
    }

    // Remove undefined values to avoid OpenAI API issues
    const cleanedBody: any = {}
    for (const [key, value] of Object.entries(continuationBody)) {
      if (value !== undefined && value !== null) {
        cleanedBody[key] = value
      }
    }

    // Normalize token params for new OpenAI models
    // New models use max_completion_tokens instead of max_tokens
    if (cleanedBody.max_completion_tokens == null && cleanedBody.max_tokens != null) {
      cleanedBody.max_completion_tokens = cleanedBody.max_tokens
      delete cleanedBody.max_tokens
    }

    return cleanedBody
  }

  // For Anthropic and Google, use universal format
  // Build assistant content
  let assistantContent: any[]
  if (provider === "google") {
    assistantContent = [
      {
        type: "tool_call" as const,
        tool_call: {
          id: toolCall.id,
          name: toolCall.name,
          arguments: toolCall.input,
        },
      },
    ]
  } else {
    // Claude/Anthropic
    assistantContent = responseJson.content
      .filter((item: any) => item.type === "tool_use")
      .map((item: any) => ({
        type: "tool_call" as const,
        tool_call: {
          id: item.id,
          name: item.name,
          arguments: item.input,
        },
      }))
  }

  const continuationMessages = [
    ...originalUniversal.messages,
    {
      id: `assistant_tool_${toolCall.id}`,
      role: "assistant" as const,
      content: assistantContent,
      metadata: { provider },
    },
    {
      id: `tool_result_${toolCall.id}`,
      role: "user" as const,
      content: [
        {
          type: "tool_result" as const,
          tool_result: {
            name: toolCall.name,
            tool_call_id: toolCall.id,
            result: provider === "google" ? toolResult : JSON.stringify(toolResult),
          },
        },
      ],
      metadata: { provider, tool_call_id: toolCall.id, name: toolCall.name },
    },
  ]

  // Anthropic requires tools to be present in continuation requests
  // OpenAI and Google don't need them, but it doesn't hurt to keep them
  return fromUniversal(provider as any, {
    ...originalUniversal,
    messages: continuationMessages,
    tools: originalUniversal.tools, // Keep tools for Anthropic
    model: originalUniversal.model || originalBody.model,
  })
}

