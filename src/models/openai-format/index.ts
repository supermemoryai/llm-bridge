import OpenAI from "openai"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
  UniversalToolCall,
} from "../../types/universal"
import { OpenAIBody } from "../../types/providers"
import { generateId } from "../../helpers/utils"

function extractSystemFromOpenAIMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): string | undefined {
  const systemMessage = messages.find((msg) => msg.role === "system")
  if (!systemMessage) return undefined

  if (typeof systemMessage.content === "string") {
    return systemMessage.content
  }

  if (Array.isArray(systemMessage.content)) {
    const textParts = (systemMessage.content as any[])
      .filter((part: any) => part.type === "text")
      .map(
        (part: any) => (part as OpenAI.Chat.ChatCompletionContentPartText).text,
      )
    return textParts.join(" ")
  }

  return undefined
}

function parseOpenAIContent(
  content: OpenAI.Chat.ChatCompletionMessageParam["content"],
): UniversalContent[] {
  if (typeof content === "string") {
    return [
      {
        _original: { provider: "openai", raw: content },
        text: content,
        type: "text",
      },
    ]
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part.type === "text") {
        return {
          _original: { provider: "openai", raw: part },
          text: part.text,
          type: "text" as const,
        }
      }
      if (part.type === "image_url") {
        // Extract MIME type and data from data URLs
        const url = part.image_url.url
        let mimeType: string | undefined
        let data: string | undefined

        if (url.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) {
            mimeType = match[1]
            data = match[2]
          }
        }

        return {
          _original: { provider: "openai", raw: part },
          media: {
            detail: part.image_url.detail,
            url: part.image_url.url,
            mimeType,
            data,
          },
          type: "image" as const,
        }
      }

      // Fallback for unknown content types
      return {
        _original: { provider: "openai", raw: part },
        text: JSON.stringify(part),
        type: "text" as const,
      }
    })
  }

  return [
    {
      _original: { provider: "openai", raw: content },
      text: JSON.stringify(content),
      type: "text",
    },
  ]
}

function parseOpenAIToolCalls(
  tool_calls: OpenAI.Chat.ChatCompletionMessageToolCall[],
): UniversalToolCall[] {
  return tool_calls.map((tc) => ({
    arguments: JSON.parse(tc.function.arguments),
    id: tc.id,
    metadata: {
      type: tc.type,
    },
    name: tc.function.name,
  }))
}

export function openaiToUniversal(body: OpenAIBody): UniversalBody<"openai"> {
  // Validate and handle malformed input
  if (!body.messages || !Array.isArray(body.messages)) {
    return {
      _original: { provider: "openai", raw: body },
      messages: [],
      model: String(body.model || "unknown"),
      provider: "openai",
    }
  }

  const systemPrompt = extractSystemFromOpenAIMessages(body.messages)
  const nonSystemMessages = body.messages.filter((msg) => msg.role !== "system")

  const universalMessages: UniversalMessage<"openai">[] = nonSystemMessages.map(
    (msg, index) => {
      const baseMessage: UniversalMessage<"openai"> = {
        content: parseOpenAIContent(msg.content),
        id: generateId(),
        metadata: {
          originalIndex: index,
          provider: "openai",
        },
        role: msg.role as UniversalRole,
      }

      // Handle tool calls
      if ("tool_calls" in msg && msg.tool_calls) {
        baseMessage.tool_calls = parseOpenAIToolCalls(msg.tool_calls)
      }

      // Handle tool responses
      if (msg.role === "tool") {
        const toolMsg = msg as OpenAI.Chat.ChatCompletionToolMessageParam
        baseMessage.metadata.tool_call_id = toolMsg.tool_call_id
      }

      return baseMessage
    },
  )

  const tools: UniversalTool[] =
    body.tools?.map((tool) => ({
      _original: { provider: "openai", raw: tool },
      description: tool.function.description || "",
      metadata: {
        type: tool.type,
      },
      name: tool.function.name,
      parameters: tool.function.parameters || {},
    })) || []

  return {
    _original: { provider: "openai", raw: body },
    frequency_penalty: body.frequency_penalty ?? undefined,
    max_tokens: body.max_tokens ?? undefined,
    messages: universalMessages,
    model: String(body.model),
    presence_penalty: body.presence_penalty ?? undefined,
    provider: "openai",
    provider_params: {
      logprobs: body.logprobs ?? undefined,
      response_format: body.response_format ?? undefined,
      top_logprobs: body.top_logprobs ?? undefined,
    },
    seed: body.seed ?? undefined,
    stream: body.stream ?? undefined,
    system: systemPrompt,
    temperature: body.temperature ?? undefined,
    tool_choice: body.tool_choice as any,
    tools: tools.length > 0 ? tools : undefined,
    top_p: body.top_p ?? undefined,
  }
}

function hasMessagesBeenModified(universal: UniversalBody<"openai">): boolean {
  if (!universal._original?.raw) return true
  
  const originalBody = universal._original.raw as OpenAIBody
  const originalMessages = originalBody.messages || []
  
  // Check if message count changed
  const originalNonSystemCount = originalMessages.filter(m => m.role !== "system").length
  const currentNonSystemCount = universal.messages.filter(m => m.role !== "system").length
  
  if (originalNonSystemCount !== currentNonSystemCount) return true
  
  // Check if any messages have contextInjection metadata (indicates injection)
  const hasInjectedMessages = universal.messages.some(m => 
    m.metadata.contextInjection || 
    !m.metadata.originalIndex // New messages without originalIndex
  )
  
  return hasInjectedMessages
}

export function universalToOpenAI(
  universal: UniversalBody<"openai">,
): OpenAIBody {
  // 🎯 PERFECT RECONSTRUCTION: If we have the original and no modifications, use it directly
  if (universal._original?.provider === "openai" && !hasMessagesBeenModified(universal)) {
    return universal._original.raw as OpenAIBody
  }

  // Otherwise, translate from universal format
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

  // Add system message if present
  if (universal.system) {
    // 🎯 BACKFILL: Use original system prompt structure if available
    if (
      typeof universal.system === "object" &&
      universal.system._original?.provider === "openai"
    ) {
      // Reconstruct from original system prompt
      const originalSystem = universal.system._original.raw as any
      messages.push(originalSystem)
    } else {
      // Fallback to universal format
      const systemContent =
        typeof universal.system === "string"
          ? universal.system
          : universal.system.content

      messages.push({
        content: systemContent,
        role: "system",
      })
    }
  }

  // Convert universal messages back to OpenAI format
  for (const msg of universal.messages) {
    const openaiMessage: OpenAI.Chat.ChatCompletionMessageParam = {
      role: msg.role as any,
    }

    // 🎯 CONTENT BACKFILL: Use original content structure when available
    if (
      msg.content.length === 1 &&
      msg.content[0]?._original?.provider === "openai"
    ) {
      // Perfect reconstruction from original - but only if it's valid OpenAI content
      const originalContent = msg.content[0]?._original?.raw
      if (originalContent) {
        openaiMessage.content = originalContent as any
      } else {
        // Fallback to universal format if original is not valid OpenAI content
        openaiMessage.content = msg.content[0]?.text || ""
      }
    } else if (msg.content.length === 1 && msg.content[0]?.type === "text") {
      // Simple text message
      openaiMessage.content = msg.content[0]?.text || ""
    } else {
      // Complex content - reconstruct each part
      openaiMessage.content = msg.content.map((content) => {
        // 🎯 PER-CONTENT BACKFILL: Use original structure if available
        if (content._original?.provider === "openai") {
          return content._original?.raw as OpenAI.Chat.ChatCompletionContentPart
        }

        // Fallback to universal format translation
        if (content.type === "text") {
          return {
            text: content.text || "",
            type: "text",
          }
        }
        if (content.type === "image") {
          return {
            image_url: {
              detail: content.media?.detail,
              url: content.media?.url,
            },
            type: "image_url",
          }
        }

        // Last resort fallback
        return {
          text: JSON.stringify(content),
          type: "text",
        }
      }) as any
    }

    // 🎯 TOOL CALLS BACKFILL: Handle tool calls with original preservation
    if (msg.tool_calls) {
      ;(openaiMessage as any).tool_calls = msg.tool_calls.map((tc) => {
        // Check if we have original tool call data
        if (
          tc.metadata &&
          "type" in tc.metadata &&
          tc.metadata.type === "function"
        ) {
          return {
            function: {
              arguments: JSON.stringify(tc.arguments),
              name: tc.name,
            },
            id: tc.id,
            type: "function",
          }
        }

        // Fallback to universal format
        return {
          function: {
            arguments: JSON.stringify(tc.arguments),
            name: tc.name,
          },
          id: tc.id,
          type: "function",
        }
      })
    }

    // 🎯 METADATA BACKFILL: Restore OpenAI-specific fields
    if (msg.role === "tool") {
      ;(openaiMessage as any).name = msg.metadata.name
      ;(openaiMessage as any).tool_call_id = msg.metadata.tool_call_id
    }

    messages.push(openaiMessage)
  }

  // 🎯 TOOLS BACKFILL: Reconstruct tools from original if available
  let tools: OpenAI.Chat.ChatCompletionTool[] | undefined
  if (universal.tools) {
    tools = universal.tools.map((tool) => {
      // Use original tool definition if available
      if (tool._original?.provider === "openai") {
        return tool._original.raw as OpenAI.Chat.ChatCompletionTool
      }

      // Fallback to universal format
      return {
        function: {
          description: tool.description,
          name: tool.name,
          parameters: tool.parameters,
        },
        type: "function",
      }
    })
  }

  // 🎯 MAIN BODY RECONSTRUCTION
  const result: OpenAIBody = {
    frequency_penalty: universal.frequency_penalty,
    max_tokens: universal.max_tokens,
    messages,
    model: universal.model,
    presence_penalty: universal.presence_penalty,
    seed: universal.seed,
    stream: universal.stream,
    temperature: universal.temperature,
    tool_choice: universal.tool_choice as any,
    top_p: universal.top_p,
  }

  // Add tools if present
  if (tools) {
    result.tools = tools
  }

  // 🎯 PROVIDER PARAMS BACKFILL: Restore OpenAI-specific parameters
  if (universal.provider_params) {
    // These were preserved from the original OpenAI request
    if (universal.provider_params.response_format !== undefined) {
      result.response_format = universal.provider_params.response_format as any
    }
    if (universal.provider_params.logprobs !== undefined) {
      result.logprobs = universal.provider_params.logprobs
    }
    if (universal.provider_params.top_logprobs !== undefined) {
      result.top_logprobs = universal.provider_params.top_logprobs
    }
  }

  return result
}
