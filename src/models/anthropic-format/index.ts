import Anthropic from "@anthropic-ai/sdk"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalSystemPrompt,
  UniversalTool,
} from "../../types/universal"
import { AnthropicBody } from "../../types/providers"
import { generateId } from "../../helpers/utils"

function parseAnthropicContent(
  content: Anthropic.MessageParam["content"],
): UniversalContent[] {
  if (typeof content === "string") {
    return [
      {
        _original: { provider: "anthropic", raw: content },
        text: content,
        type: "text",
      },
    ]
  }

  if (Array.isArray(content)) {
    return content.map((block) => {
      if (block.type === "thinking") {
        return {
          _original: { provider: "anthropic", raw: block },
          thinking: (block as any).thinking,
          signature: (block as any).signature,
          type: "thinking" as const,
        }
      }
      if (block.type === "redacted_thinking") {
        return {
          _original: { provider: "anthropic", raw: block },
          type: "redacted_thinking" as const,
        }
      }
      if (block.type === "text") {
        return {
          _original: { provider: "anthropic", raw: block },
          text: block.text,
          type: "text" as const,
        }
      }
      if (block.type === "image") {
        const imageBlock = block as any
        if (imageBlock.source?.type === "url") {
          return {
            _original: { provider: "anthropic", raw: block },
            media: {
              url: imageBlock.source.url,
              mimeType: imageBlock.source.media_type,
            },
            type: "image" as const,
          }
        }
        return {
          _original: { provider: "anthropic", raw: block },
          media: {
            data: imageBlock.source?.data,
            mimeType: imageBlock.source?.media_type,
          },
          type: "image" as const,
        }
      }
      if (block.type === "tool_use") {
        const toolBlock = block as Anthropic.Messages.ToolUseBlockParam
        return {
          _original: { provider: "anthropic", raw: block },
          tool_call: {
            arguments: (toolBlock.input as Record<string, unknown>) || {},
            id: toolBlock.id,
            metadata: {
              input: toolBlock.input,
            },
            name: toolBlock.name,
          },
          type: "tool_call" as const,
        }
      }
      if (block.type === "tool_result") {
        return {
          _original: { provider: "anthropic", raw: block },
          tool_result: {
            is_error: (block as any).is_error || false,
            metadata: {
              content: block.content,
              tool_use_id: block.tool_use_id,
            },
            name: "", // Anthropic doesn't include function name in tool_result
            result: block.content,
            tool_call_id: block.tool_use_id,
          },
          type: "tool_result" as const,
        }
      }

      // Fallback for unknown content types
      return {
        _original: { provider: "anthropic", raw: block },
        text: JSON.stringify(block),
        type: "text" as const,
      }
    })
  }

  return [
    {
      _original: { provider: "anthropic", raw: content },
      text: JSON.stringify(content),
      type: "text",
    },
  ]
}

export function anthropicToUniversal(
  body: AnthropicBody,
): UniversalBody<"anthropic"> {
  // Validate and handle malformed input
  if (!body.messages || !Array.isArray(body.messages)) {
    return {
      _original: { provider: "anthropic", raw: body },
      messages: [],
      model: String(body.model || "unknown"),
      provider: "anthropic",
      max_tokens: body.max_tokens || 1024,
    }
  }

  const universalMessages: UniversalMessage<"anthropic">[] = body.messages.map(
    (msg, index) => {
      // Check for cache control in message content
      let cacheControl: { type: "ephemeral" } | undefined = undefined
      if (Array.isArray(msg.content)) {
        const hasCache = msg.content.some(
          (block) =>
            typeof block === "object" &&
            block &&
            "cache_control" in block &&
            block.cache_control,
        )
        if (hasCache) {
          cacheControl = { type: "ephemeral" }
        }
      }

      return {
        content: parseAnthropicContent(msg.content),
        id: generateId(),
        metadata: {
          originalIndex: index,
          provider: "anthropic",
          cache_control: cacheControl,
        },
        role: msg.role satisfies UniversalRole,
      }
    },
  )

  const tools: UniversalTool[] =
    body.tools?.map((tool) => {
      if ("input_schema" in tool) {
        return {
          _original: { provider: "anthropic", raw: tool },
          description: tool.description || "",
          metadata: {
            input_schema: tool.input_schema,
          },
          name: tool.name,
          parameters: tool.input_schema,
        }
      }
      return {
        _original: { provider: "anthropic", raw: tool },
        description: "",
        metadata: {},
        name: (tool as any).name || "unknown",
        parameters: {},
      }
    }) || []

  // Handle system prompt with cache control
  let systemPrompt: string | UniversalSystemPrompt | undefined = undefined
  if (body.system) {
    if (typeof body.system === "string") {
      systemPrompt = body.system
    } else if (Array.isArray(body.system)) {
      // Complex system prompt with cache control
      const textParts = body.system.filter((part) => part.type === "text")
      if (textParts.length > 0) {
        const mainText = textParts.map((part) => part.text).join(" ")
        const hasCacheControl = textParts.some((part) => part.cache_control)

        if (hasCacheControl) {
          systemPrompt = {
            content: mainText,
            cache_control: { type: "ephemeral" },
            _original: { provider: "anthropic", raw: body.system },
          }
        } else {
          systemPrompt = mainText
        }
      }
    }
  }

  return {
    _original: { provider: "anthropic", raw: body },
    max_tokens: body.max_tokens,
    messages: universalMessages,
    model: String(body.model),
    provider: "anthropic",
    provider_params: {
      anthropic_version: (body as any).anthropic_version,
      stop_sequences: body.stop_sequences,
    },
    stream: body.stream,
    system: systemPrompt,
    temperature: body.temperature,
    thinking: (body as any).thinking?.type === "enabled"
      ? {
          enabled: true,
          budget_tokens: (body as any).thinking.budget_tokens,
        }
      : undefined,
    tool_choice:
      typeof body.tool_choice === "string"
        ? (body.tool_choice as any)
        : typeof body.tool_choice === "object" && body.tool_choice !== null && "name" in body.tool_choice
        ? { name: (body.tool_choice as any).name }
        : undefined,
    tools: tools.length > 0 ? tools : undefined,
    top_p: body.top_p,
  }
}

function hasMessagesBeenModified(universal: UniversalBody<"anthropic">): boolean {
  if (!universal._original?.raw) return true

  const originalBody = universal._original.raw as AnthropicBody
  const originalMessages = originalBody.messages || []

  // Check if message count changed
  if (originalMessages.length !== universal.messages.length) return true

  // Check if any messages have contextInjection metadata (indicates injection)
  const hasInjectedMessages = universal.messages.some(m =>
    m.metadata.contextInjection ||
    m.metadata.originalIndex === undefined // New messages without originalIndex
  )

  return hasInjectedMessages
}

export function universalToAnthropic(
  universal: UniversalBody<"anthropic">,
): AnthropicBody {
  // If we have the original and no modifications, we can reconstruct perfectly
  if (universal._original?.provider === "anthropic" && !hasMessagesBeenModified(universal)) {
    return universal._original.raw as AnthropicBody
  }

  // Extract developer messages and merge into system prompt
  const developerMessages = universal.messages.filter(m => m.role === "developer")
  const regularMessages = universal.messages.filter(m => m.role !== "developer")

  // Convert universal messages back to Anthropic format
  const messages: Anthropic.MessageParam[] = regularMessages.map((msg) => {
    const anthropicMessage: Anthropic.MessageParam = {
      content: msg.content.map((content) => {
        if (content._original?.provider === "anthropic") {
          if (typeof content._original.raw !== "string") {
            return content._original.raw as Anthropic.ContentBlock
          }
        }

        if (content.type === "thinking") {
          return {
            type: "thinking",
            thinking: content.thinking || "",
            ...(content.signature ? { signature: content.signature } : {}),
          }
        }
        if (content.type === "redacted_thinking") {
          return {
            type: "redacted_thinking",
            data: "",  // Redacted content can't be reconstructed
          }
        }
        if (content.type === "text") {
          return {
            text: content.text || "",
            type: "text",
          }
        }
        if (content.type === "image") {
          if (content.media?.url && !content.media?.data) {
            // URL-based image
            return {
              source: {
                type: "url",
                url: content.media.url,
                ...(content.media.mimeType ? { media_type: content.media.mimeType } : {}),
              },
              type: "image",
            }
          }
          // Base64 image
          return {
            source: {
              data: content.media?.data || "",
              media_type: content.media?.mimeType as any,
              type: "base64",
            },
            type: "image",
          }
        }
        if (content.type === "tool_call") {
          return {
            id: content.tool_call?.id || "",
            input: content.tool_call?.arguments || {},
            name: content.tool_call?.name || "",
            type: "tool_use",
          }
        }
        if (content.type === "tool_result") {
          const toolResultBlock: any = {
            content:
              typeof content.tool_result?.result === "string"
                ? content.tool_result.result
                : JSON.stringify(content.tool_result?.result || {}),
            tool_use_id: content.tool_result?.tool_call_id || "",
            type: "tool_result",
          }
          if (content.tool_result?.is_error) {
            toolResultBlock.is_error = true
          }
          return toolResultBlock
        }

        // Fallback
        return {
          text: JSON.stringify(content),
          type: "text",
        }
      }),
      role: msg.role as "user" | "assistant",
    }

    // Reconstruct tool_use blocks from message-level tool_calls (cross-provider translation)
    // OpenAI stores tool calls at the message level, not in content blocks
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolUseBlocks = msg.tool_calls.map((tc) => ({
        id: tc.id,
        input: tc.arguments || {},
        name: tc.name,
        type: "tool_use" as const,
      }))
      anthropicMessage.content = [
        ...(Array.isArray(anthropicMessage.content) ? anthropicMessage.content : []),
        ...toolUseBlocks,
      ] as any
    }

    return anthropicMessage
  })

  const result: AnthropicBody = {
    max_tokens: universal.max_tokens ?? 1024,
    messages,
    model: universal.model,
    stream: universal.stream,
    temperature: universal.temperature,
    top_p: universal.top_p,
  }

  // Add system if present
  if (universal.system) {
    if (typeof universal.system === "string") {
      result.system = universal.system
    } else if (universal.system.cache_control) {
      // Reconstruct as array of text blocks with cache_control for prompt caching
      result.system = [
        {
          type: "text",
          text: universal.system.content,
          cache_control: universal.system.cache_control,
        },
      ] as any
    } else {
      result.system = universal.system.content
    }
  }

  // If there are developer messages, append their text to the system prompt
  if (developerMessages.length > 0) {
    const developerText = developerMessages
      .flatMap(m => m.content.filter(c => c.type === "text" && c.text).map(c => c.text!))
      .join("\n")

    if (result.system) {
      const existingSystem = typeof result.system === "string"
        ? result.system
        : Array.isArray(result.system)
          ? result.system.map((b: any) => b.text || "").join("\n")
          : String(result.system)
      result.system = existingSystem + "\n" + developerText
    } else {
      result.system = developerText
    }
  }

  // Add thinking config if present
  if (universal.thinking?.enabled) {
    (result as any).thinking = {
      type: "enabled",
      budget_tokens: universal.thinking.budget_tokens || 10240,
    }
  }

  // Add tools if present
  if (universal.tools) {
    result.tools = universal.tools.map((tool) => {
      if (tool._original?.provider === "anthropic") {
        return tool._original.raw as Anthropic.Tool
      }

      return {
        description: tool.description,
        input_schema: {
          ...tool.parameters,
          type: "object",
        },
        name: tool.name,
      }
    })
  }

  // Add tool choice
  if (universal.tool_choice) {
    if (typeof universal.tool_choice === "string") {
      result.tool_choice = { type: universal.tool_choice as any }
    } else if (typeof universal.tool_choice === "object" && "name" in universal.tool_choice) {
      result.tool_choice = { type: "tool", name: universal.tool_choice.name } as any
    }
  }

  // Add provider-specific params
  if (universal.provider_params?.stop_sequences) {
    result.stop_sequences = universal.provider_params.stop_sequences
  }

  return result
}
