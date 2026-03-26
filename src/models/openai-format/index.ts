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

      if (part.type === "input_audio") {
        return {
          _original: { provider: "openai", raw: part },
          media: {
            data: (part as any).input_audio.data,
            mimeType: `audio/${(part as any).input_audio.format || "wav"}`,
          },
          type: "audio" as const,
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

      // Handle tool responses - convert to tool_result content
      if (msg.role === "tool") {
        const toolMsg = msg as any // OpenAI.Chat.ChatCompletionToolMessageParam
        baseMessage.metadata.tool_call_id = toolMsg.tool_call_id
        baseMessage.metadata.name = toolMsg.name

        // Convert content to tool_result format
        const contentString = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        baseMessage.content = [
          {
            type: "tool_result",
            tool_result: {
              tool_call_id: toolMsg.tool_call_id,
              name: toolMsg.name || "",
              result: contentString,
            },
            _original: {
              provider: "openai",
              raw: msg.content,
            },
          },
        ]
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
        strict: (tool.function as any).strict,
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
      reasoning_effort: (body as any).reasoning_effort ?? undefined,
      response_format: body.response_format ?? undefined,
      top_logprobs: body.top_logprobs ?? undefined,
      verbosity: (body as any).verbosity ?? undefined,
      parallel_tool_calls: (body as any).parallel_tool_calls ?? undefined,
    },
    reasoning_effort: (body as any).reasoning_effort ?? undefined,
    seed: body.seed ?? undefined,
    stream: body.stream ?? undefined,
    structured_output: body.response_format?.type === "json_schema"
      ? {
          type: "json_schema" as const,
          json_schema: (body.response_format as any).json_schema,
        }
      : body.response_format?.type === "json_object"
      ? { type: "json_object" as const }
      : undefined,
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

    // Filter out thinking/redacted_thinking content (OpenAI Chat Completions doesn't support thinking blocks)
    const filteredContent = msg.content.filter(
      (c) => c.type !== "thinking" && c.type !== "redacted_thinking"
    )

    // 🎯 CONTENT BACKFILL: Use original content structure when available
    if (
      filteredContent.length === 1 &&
      filteredContent[0]?._original?.provider === "openai"
    ) {
      // Perfect reconstruction from original - but only if it's valid OpenAI content
      const originalContent = filteredContent[0]?._original?.raw
      if (originalContent !== null && originalContent !== undefined) {
        if (typeof originalContent === "string") {
          openaiMessage.content = originalContent
        } 
        else if (Array.isArray(originalContent)) {
          openaiMessage.content = originalContent as any
        } 
        else if (typeof originalContent === "object" && originalContent !== null) {
          openaiMessage.content = [originalContent] as any
        } 
        // Fallback to universal format if original is not valid OpenAI content
        else {
          openaiMessage.content = filteredContent[0]?.text || ""
        }
      } else {
        // Fallback to universal format if original is not valid OpenAI content
        openaiMessage.content = filteredContent[0]?.text || ""
      }
    } else if (filteredContent.length === 1 && filteredContent[0]?.type === "text") {
      // Simple text message
      openaiMessage.content = filteredContent[0]?.text || ""
    } else if (filteredContent.length === 1 && filteredContent[0]?.type === "tool_result") {
      // Tool result content - OpenAI expects string content for tool messages
      const result = filteredContent[0]?.tool_result?.result
      openaiMessage.content = typeof result === "string" ? result : JSON.stringify(result)
    } else {
      // Complex content - reconstruct each part
      openaiMessage.content = filteredContent.map((content) => {
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
          strict: tool.metadata?.strict,
        },
        type: "function",
      } as OpenAI.Chat.ChatCompletionTool
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
    if (universal.provider_params.reasoning_effort !== undefined) {
      (result as any).reasoning_effort = universal.provider_params.reasoning_effort
    }
    if (universal.provider_params.verbosity !== undefined) {
      (result as any).verbosity = universal.provider_params.verbosity
    }
    if (universal.provider_params.parallel_tool_calls !== undefined) {
      (result as any).parallel_tool_calls = universal.provider_params.parallel_tool_calls
    }
  }

  // Write back reasoning_effort from top-level if set and not already written from provider_params
  if (universal.reasoning_effort !== undefined && !(result as any).reasoning_effort) {
    (result as any).reasoning_effort = universal.reasoning_effort
  }

  // 🎯 STRUCTURED OUTPUT: Reconstruct response_format from structured_output if not already set
  if (universal.structured_output && !result.response_format) {
    if (universal.structured_output.type === "json_schema" && universal.structured_output.json_schema) {
      result.response_format = {
        type: "json_schema",
        json_schema: universal.structured_output.json_schema,
      } as any
    } else if (universal.structured_output.type === "json_object") {
      result.response_format = { type: "json_object" } as any
    }
  }

  return result
}
