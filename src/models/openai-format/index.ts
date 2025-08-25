import OpenAI from "openai"
import type {
  ResponseCreateParams as OpenAIResponsesCreateParams,
  ResponseInputItem as OpenAIResponseInputItem,
  ResponseInputText as OpenAIResponseInputText,
  ResponseInputImage as OpenAIResponseInputImage,
  ResponseInputFile as OpenAIResponseInputFile,
  FunctionTool as OpenAIFunctionTool,
  ToolChoiceFunction as OpenAIToolChoiceFunction,
  ToolChoiceOptions as OpenAIToolChoiceOptions,
  ToolChoiceTypes as OpenAIToolChoiceTypes,
} from "openai/resources/responses/responses"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
  UniversalToolCall,
} from "../../types/universal"
import { OpenAIBody, OpenAIChatBody, OpenAIResponsesBody } from "../../types/providers"
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
  // Determine whether this is Chat Completions or Responses API shape
  if (isOpenAIResponsesBody(body)) {
    return responsesToUniversal(body)
  }

  // Validate and handle malformed input for Chat Completions
  if (!("messages" in body) || !Array.isArray((body as OpenAIChatBody).messages)) {
    return {
      _original: { provider: "openai", raw: body },
      messages: [],
      model: String((body as any).model || "unknown"),
      provider: "openai",
    }
  }

  const chatBody = body as OpenAIChatBody
  const systemPrompt = extractSystemFromOpenAIMessages(chatBody.messages)
  const nonSystemMessages = chatBody.messages.filter((msg) => msg.role !== "system")

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
    chatBody.tools?.map((tool) => ({
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
    frequency_penalty: chatBody.frequency_penalty ?? undefined,
    max_tokens: chatBody.max_tokens ?? undefined,
    messages: universalMessages,
    model: String(chatBody.model),
    presence_penalty: chatBody.presence_penalty ?? undefined,
    provider: "openai",
    provider_params: {
      logprobs: chatBody.logprobs ?? undefined,
      response_format: chatBody.response_format ?? undefined,
      top_logprobs: chatBody.top_logprobs ?? undefined,
    },
    seed: chatBody.seed ?? undefined,
    stream: chatBody.stream ?? undefined,
    system: systemPrompt,
    temperature: chatBody.temperature ?? undefined,
    tool_choice: chatBody.tool_choice as any,
    tools: tools.length > 0 ? tools : undefined,
    top_p: chatBody.top_p ?? undefined,
  }
}

function hasMessagesBeenModified(universal: UniversalBody<"openai">): boolean {
  if (!universal._original?.raw) return true
  
  const originalBody = universal._original.raw as OpenAIBody
  const originalMessages = (originalBody as OpenAIChatBody).messages || []
  
  // Check if message count changed
  const originalNonSystemCount = originalMessages.filter((m: OpenAI.Chat.ChatCompletionMessageParam) => m.role !== "system").length
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

  // Decide which OpenAI shape to emit
  if (shouldEmitResponses(universal)) {
    return universalToResponses(universal)
  }

  // Otherwise, translate from universal format to Chat Completions
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
  const result: OpenAIChatBody = {
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
      ;(result as OpenAIChatBody).response_format = universal.provider_params.response_format as any
    }
    if (universal.provider_params.logprobs !== undefined) {
      ;(result as OpenAIChatBody).logprobs = universal.provider_params.logprobs
    }
    if (universal.provider_params.top_logprobs !== undefined) {
      ;(result as OpenAIChatBody).top_logprobs = universal.provider_params.top_logprobs
    }
  }

  return result as OpenAIBody
}

// ------------------------
// Helpers and new Responses support
// ------------------------

function isOpenAIResponsesBody(body: OpenAIBody): body is OpenAIResponsesBody {
  const anyBody = body as Record<string, unknown>
  return (
    "input" in anyBody ||
    "instructions" in anyBody ||
    "previous_response_id" in anyBody ||
    "max_output_tokens" in anyBody ||
    ("tools" in anyBody && !("messages" in anyBody))
  )
}

function responsesToUniversal(body: OpenAIResponsesBody): UniversalBody<"openai"> {
  const messages: UniversalMessage<"openai">[] = []

  // Convert input to messages
  if (typeof body.input === "string") {
    messages.push({
      content: [
        {
          _original: { provider: "openai", raw: { type: "input_text", text: body.input } },
          text: body.input,
          type: "text",
        },
      ],
      id: generateId(),
      metadata: { provider: "openai" },
      role: "user",
    })
  } else if (Array.isArray(body.input)) {
    for (const item of (body.input as NonNullable<OpenAIResponsesCreateParams["input"]>)) {
      const asMessage = getResponseInputItemMessage(item)
      if (asMessage) {
        messages.push({
          content: parseResponsesMessageContent(asMessage.content),
          id: generateId(),
          metadata: { provider: "openai" },
          role: asMessage.role as UniversalRole,
        })
      } else {
        // Preserve unknown/other items as a user text with JSON content
        messages.push({
          content: [
            {
              _original: { provider: "openai", raw: item },
              text: JSON.stringify(item),
              type: "text",
            },
          ],
          id: generateId(),
          metadata: { provider: "openai" },
          role: "user",
        })
      }
    }
  }

  // Map function tools; preserve built-in tools in provider_params
  const functionTools: UniversalTool[] = []
  const builtinTools: unknown[] = []
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if ((tool as OpenAIFunctionTool).type === "function") {
        const f = tool as OpenAIFunctionTool
        functionTools.push({
          _original: { provider: "openai", raw: f },
          description: f.description || "",
          metadata: { type: "function" },
          name: f.name,
          parameters: (f.parameters as Record<string, unknown>) || {},
        })
      } else {
        builtinTools.push(tool)
      }
    }
  }

  // Build universal body
  const universal: UniversalBody<"openai"> = {
    _original: { provider: "openai", raw: body },
    messages,
    model: String((body as any).model || "unknown"),
    provider: "openai",
    stream: body.stream ?? undefined,
    temperature: body.temperature ?? undefined,
    top_p: body.top_p ?? undefined,
    max_tokens: body.max_output_tokens ?? undefined,
    tools: functionTools.length > 0 ? functionTools : undefined,
  }

  if (typeof body.instructions === "string" && body.instructions.length > 0) {
    universal.system = body.instructions
  }

  // Pass-through provider-specific fields, including stateful hints
  const providerParams: Record<string, unknown> = {}
  if (typeof body.store !== "undefined") providerParams.store = body.store
  if (typeof body.previous_response_id !== "undefined") providerParams.previous_response_id = body.previous_response_id
  if (typeof body.include !== "undefined") providerParams.include = body.include
  if (typeof (body as any).text !== "undefined") providerParams.text = (body as any).text
  if (typeof (body as any).parallel_tool_calls !== "undefined") providerParams.parallel_tool_calls = (body as any).parallel_tool_calls
  if (typeof (body as any).service_tier !== "undefined") providerParams.service_tier = (body as any).service_tier
  if (typeof (body as any).truncation !== "undefined") providerParams.truncation = (body as any).truncation
  if (typeof (body as any).background !== "undefined") providerParams.background = (body as any).background
  if (typeof (body as any).user !== "undefined") providerParams.user = (body as any).user
  if (typeof (body as any).metadata !== "undefined") providerParams.metadata = (body as any).metadata

  if (builtinTools.length > 0) providerParams.responses_builtin_tools = builtinTools

  if (Object.keys(providerParams).length > 0) {
    universal.provider_params = providerParams
  }

  return universal
}

function parseResponsesMessageContent(
  contents: unknown,
): UniversalContent[] {
  const result: UniversalContent[] = []
  const list: Array<unknown> = Array.isArray(contents) ? (contents as Array<unknown>) : []
  for (const part of list) {
    const content = part as OpenAIResponseInputText | OpenAIResponseInputImage | OpenAIResponseInputFile
    if ((content as OpenAIResponseInputText).type === "input_text") {
      const textContent = content as OpenAIResponseInputText
      result.push({
        _original: { provider: "openai", raw: textContent },
        text: textContent.text,
        type: "text",
      })
      continue
    }
    if ((content as OpenAIResponseInputImage).type === "input_image") {
      const img = content as OpenAIResponseInputImage
      result.push({
        _original: { provider: "openai", raw: img },
        media: {
          detail: img.detail,
          url: img.image_url || undefined,
        },
        type: "image",
      })
      continue
    }
    if ((content as OpenAIResponseInputFile).type === "input_file") {
      const file = content as OpenAIResponseInputFile
      result.push({
        _original: { provider: "openai", raw: file },
        media: {
          fileUri: file.file_id || undefined,
          url: file.file_url || undefined,
          data: file.file_data || undefined,
        },
        type: "document",
      })
      continue
    }
    // Fallback
    result.push({
      _original: { provider: "openai", raw: content },
      text: JSON.stringify(content),
      type: "text",
    })
  }
  return result
}

function getResponseInputItemMessage(
  item: unknown,
): { role: "user" | "system" | "developer"; content: unknown } | null {
  const candidate = item as Record<string, unknown>
  // ResponseInputItem.Message has type?: 'message'
  if (
    candidate &&
    typeof candidate === "object" &&
    (candidate["type"] === "message" || ("role" in candidate && "content" in candidate))
  ) {
    const role = candidate["role"]
    if (role === "user" || role === "system" || role === "developer") {
      return { role, content: candidate["content"] }
    }
  }
  return null
}

function shouldEmitResponses(universal: UniversalBody<"openai">): boolean {
  const original = universal._original?.raw as Record<string, unknown> | undefined
  const hint = universal.provider_params as Record<string, unknown> | undefined
  const originalLooksLikeResponses = !!original && (
    "input" in original ||
    "instructions" in original ||
    "previous_response_id" in original ||
    "max_output_tokens" in original
  )
  const hintSaysResponses = !!hint && hint["openai_target"] === "responses"
  return originalLooksLikeResponses || hintSaysResponses
}

function universalToResponses(
  universal: UniversalBody<"openai">,
): OpenAIResponsesBody {
  const result: OpenAIResponsesCreateParams = {
    model: universal.model,
  }

  // Streaming
  if (typeof universal.stream !== "undefined") {
    if (universal.stream === true) {
      ;(result as any).stream = true
    } else {
      ;(result as any).stream = false
    }
  }

  // Temperature/top_p
  if (typeof universal.temperature !== "undefined") result.temperature = universal.temperature
  if (typeof universal.top_p !== "undefined") result.top_p = universal.top_p

  // Max tokens maps to max_output_tokens
  if (typeof universal.max_tokens !== "undefined") result.max_output_tokens = universal.max_tokens

  // instructions from system
  if (universal.system) {
    const systemText = typeof universal.system === "string" ? universal.system : universal.system.content
    result.instructions = systemText
  }

  // input from messages
  const inputItems: Array<OpenAIResponseInputItem> = []
  for (const msg of universal.messages) {
    // Only include roles allowed for request input messages
    if (msg.role !== "user" && msg.role !== "system" && msg.role !== "developer") {
      continue
    }
    const contentList: Array<OpenAIResponseInputText | OpenAIResponseInputImage | OpenAIResponseInputFile> = []
    for (const c of msg.content) {
      if (c.type === "text" && typeof c.text === "string") {
        contentList.push({ type: "input_text", text: c.text })
      } else if (c.type === "image") {
        const imageUrl = c.media?.url
        const detail = (c.media?.detail as OpenAIResponseInputImage["detail"]) || "auto"
        const part: OpenAIResponseInputImage = { type: "input_image", detail }
        if (imageUrl) part.image_url = imageUrl
        contentList.push(part)
      } else if (c.type === "document") {
        const file: OpenAIResponseInputFile = { type: "input_file" }
        if (c.media?.url) file.file_url = c.media.url
        if (c.media?.fileUri) file.file_id = c.media.fileUri
        if (c.media?.data) file.file_data = c.media.data
        contentList.push(file)
      }
    }
    if (contentList.length > 0) {
      inputItems.push({
        content: contentList,
        role: msg.role as "user" | "system" | "developer",
        type: "message",
      })
    }
  }
  if (inputItems.length > 0) {
    result.input = inputItems
  }

  // Tools
  const tools: Array<OpenAIFunctionTool | OpenAIToolChoiceTypes> = []
  if (Array.isArray(universal.tools)) {
    for (const t of universal.tools) {
      const functionTool: OpenAIFunctionTool = {
        description: t.description || null,
        name: t.name,
        parameters: t.parameters || {},
        strict: null,
        type: "function",
      }
      tools.push(functionTool)
    }
  }
  const pp = (universal.provider_params || {}) as Record<string, unknown>
  const builtins = Array.isArray(pp.responses_builtin_tools) ? (pp.responses_builtin_tools as Array<OpenAIToolChoiceTypes>) : []
  if (builtins.length > 0) {
    for (const b of builtins) tools.push(b as OpenAIToolChoiceTypes)
  }
  if (tools.length > 0) {
    ;(result as any).tools = tools
  }

  // Tool choice
  if (typeof universal.tool_choice !== "undefined") {
    const tc = universal.tool_choice
    if (tc === "auto" || tc === "none" || tc === "required") {
      ;(result as any).tool_choice = tc as OpenAIToolChoiceOptions
    } else if (tc && typeof tc === "object" && "name" in tc) {
      const choice: OpenAIToolChoiceFunction = { type: "function", name: (tc as { name: string }).name }
      ;(result as any).tool_choice = choice
    }
  }

  // Pass-through stateful and other OpenAI Responses params
  if (typeof pp.store !== "undefined") (result as any).store = pp.store
  if (typeof pp.previous_response_id !== "undefined") (result as any).previous_response_id = pp.previous_response_id
  if (typeof pp.include !== "undefined") (result as any).include = pp.include
  if (typeof pp.text !== "undefined") (result as any).text = pp.text
  if (typeof pp.parallel_tool_calls !== "undefined") (result as any).parallel_tool_calls = pp.parallel_tool_calls
  if (typeof pp.service_tier !== "undefined") (result as any).service_tier = pp.service_tier
  if (typeof pp.truncation !== "undefined") (result as any).truncation = pp.truncation
  if (typeof pp.background !== "undefined") (result as any).background = pp.background
  if (typeof pp.user !== "undefined") (result as any).user = pp.user
  if (typeof pp.metadata !== "undefined") (result as any).metadata = pp.metadata

  return result as OpenAIResponsesBody
}
