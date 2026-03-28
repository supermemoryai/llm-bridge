import { generateId } from "../../helpers/utils"
import { OpenAIResponsesBody } from "../../types/providers"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
} from "../../types/universal"

function parseResponsesContent(content: any): UniversalContent[] {
  if (typeof content === "string") {
    return [{ _original: { provider: "openai-responses", raw: content }, text: content, type: "text" }]
  }

  if (Array.isArray(content)) {
    return content.map((part: any) => {
      if (part.type === "input_text") {
        return { _original: { provider: "openai-responses", raw: part }, text: part.text, type: "text" as const }
      }
      if (part.type === "input_image") {
        const url = typeof part.image_url === "string" ? part.image_url : part.image_url?.url
        let mimeType: string | undefined
        let data: string | undefined
        if (url?.startsWith("data:")) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/)
          if (match) { mimeType = match[1]; data = match[2] }
        }
        return {
          _original: { provider: "openai-responses", raw: part },
          media: { url, detail: part.image_url?.detail, mimeType, data },
          type: "image" as const,
        }
      }
      if (part.type === "input_audio") {
        return {
          _original: { provider: "openai-responses", raw: part },
          media: { data: part.input_audio?.data, mimeType: `audio/${part.input_audio?.format || "wav"}` },
          type: "audio" as const,
        }
      }
      // Fallback
      return { _original: { provider: "openai-responses", raw: part }, text: JSON.stringify(part), type: "text" as const }
    })
  }

  return [{ _original: { provider: "openai-responses", raw: content }, text: JSON.stringify(content), type: "text" }]
}

export function openaiResponsesToUniversal(body: OpenAIResponsesBody): UniversalBody<"openai-responses"> {
  const input = body.input || []

  // Handle string input
  if (typeof input === "string") {
    return {
      _original: { provider: "openai-responses", raw: body },
      messages: [{
        content: [{ _original: { provider: "openai-responses", raw: input }, text: input, type: "text" }],
        id: generateId(),
        metadata: { originalIndex: 0, provider: "openai-responses" },
        role: "user",
      }],
      model: String(body.model || "unknown"),
      provider: "openai-responses",
    }
  }

  // Extract system/developer messages and regular messages
  let systemPrompt: string | undefined
  const universalMessages: UniversalMessage<"openai-responses">[] = []

  for (let i = 0; i < input.length; i++) {
    const item = input[i]

    // Handle function_call_output items (tool results)
    if (item.type === "function_call_output") {
      universalMessages.push({
        content: [{
          type: "tool_result",
          tool_result: {
            tool_call_id: item.call_id,
            name: "",
            result: item.output,
          },
          _original: { provider: "openai-responses", raw: item },
        }],
        id: generateId(),
        metadata: { originalIndex: i, provider: "openai-responses", tool_call_id: item.call_id },
        role: "tool",
      })
      continue
    }

    // Regular message items
    const role = item.role || "user"

    if (role === "system") {
      const text = typeof item.content === "string" ? item.content :
        Array.isArray(item.content) ? item.content.filter((p: any) => p.type === "input_text").map((p: any) => p.text).join(" ") : ""
      systemPrompt = systemPrompt ? systemPrompt + "\n" + text : text
      continue
    }

    universalMessages.push({
      content: parseResponsesContent(item.content),
      id: generateId(),
      metadata: { originalIndex: i, provider: "openai-responses" },
      role: role as UniversalRole,
    })
  }

  // Parse tools - flattened format in Responses API
  const tools: UniversalTool[] = (body.tools || [])
    .filter((t: any) => t.type === "function")
    .map((tool: any) => ({
      _original: { provider: "openai-responses", raw: tool },
      description: tool.description || "",
      metadata: { type: "function", strict: tool.strict },
      name: tool.name,
      parameters: tool.parameters || {},
    }))

  // Identify built-in tools
  const builtinTools = (body.tools || []).filter((t: any) =>
    t.type === "web_search_preview" || t.type === "file_search" || t.type === "computer_use_preview" || t.type === "code_interpreter"
  )

  // Parse reasoning config
  const thinking = body.reasoning ? {
    enabled: true,
    effort: body.reasoning.effort as "low" | "medium" | "high" | undefined,
  } : undefined

  // Parse structured output from text.format
  const structured_output = body.text?.format?.type === "json_schema" ? {
    type: "json_schema" as const,
    json_schema: {
      name: body.text.format.name,
      strict: body.text.format.strict,
      schema: body.text.format.schema,
    },
  } : body.text?.format?.type === "json_object" ? { type: "json_object" as const } : undefined

  return {
    _original: { provider: "openai-responses", raw: body },
    max_tokens: body.max_output_tokens,
    messages: universalMessages,
    model: String(body.model || "unknown"),
    provider: "openai-responses",
    provider_params: {
      truncation: body.truncation,
      store: body.store,
      reasoning_summary: body.reasoning?.summary,
      builtin_tools: builtinTools.length > 0 ? builtinTools : undefined,
      previous_response_id: body.previous_response_id,
    },
    reasoning_effort: body.reasoning?.effort,
    stream: body.stream,
    structured_output,
    system: systemPrompt,
    temperature: body.temperature,
    thinking,
    tool_choice: body.tool_choice as any,
    tools: tools.length > 0 ? tools : undefined,
    top_p: body.top_p,
  }
}

export function universalToOpenaiResponses(universal: UniversalBody<"openai-responses">): OpenAIResponsesBody {
  // If we have the original and no modifications, use it directly
  if (universal._original?.provider === "openai-responses") {
    const originalBody = universal._original.raw as OpenAIResponsesBody
    const originalInput = originalBody.input || []
    const originalCount = typeof originalInput === "string" ? 1 : originalInput.length
    // Simple check: if message count matches and no injected messages, use original
    const systemCount = universal.system ? 1 : 0
    const hasInjected = universal.messages.some((m: any) => m.metadata?.contextInjection)
    if (!hasInjected && (universal.messages.length + systemCount) === originalCount) {
      return originalBody
    }
  }

  const input: any[] = []

  // Add system message
  if (universal.system) {
    const systemContent = typeof universal.system === "string" ? universal.system : universal.system.content
    input.push({ role: "system", content: systemContent })
  }

  // Convert messages
  for (const msg of universal.messages) {
    // Handle developer role
    if (msg.role === "developer") {
      const text = msg.content.filter(c => c.type === "text" && c.text).map(c => c.text!).join(" ")
      input.push({ role: "developer", content: text })
      continue
    }

    // Handle tool results → function_call_output
    // Check both "tool" role and messages containing tool_result content (e.g. from Anthropic user messages)
    const toolResults = msg.content.filter(c => c.type === "tool_result")
    if (msg.role === "tool" || toolResults.length > 0) {
      if (toolResults.length > 0) {
        for (const toolResult of toolResults) {
          if (toolResult.tool_result) {
            input.push({
              type: "function_call_output",
              call_id: toolResult.tool_result.tool_call_id || msg.metadata?.tool_call_id,
              output: typeof toolResult.tool_result.result === "string"
                ? toolResult.tool_result.result
                : JSON.stringify(toolResult.tool_result.result),
            })
          }
        }
        // If the message ONLY had tool results, skip adding it as a regular message
        if (toolResults.length === msg.content.length) continue
      }
    }

    // Regular messages
    const contentParts: any[] = []
    for (const content of msg.content) {
      if (content.type === "text") {
        contentParts.push({ type: "input_text", text: content.text || "" })
      } else if (content.type === "image") {
        if (content.media?.url) {
          contentParts.push({ type: "input_image", image_url: content.media.url })
        } else if (content.media?.data) {
          const dataUrl = `data:${content.media.mimeType || "image/jpeg"};base64,${content.media.data}`
          contentParts.push({ type: "input_image", image_url: dataUrl })
        }
      } else if (content.type === "audio") {
        contentParts.push({
          type: "input_audio",
          input_audio: { data: content.media?.data, format: content.media?.mimeType?.split("/")[1] || "wav" },
        })
      } else if (content.type === "thinking" || content.type === "redacted_thinking") {
        // Skip thinking content
        continue
      } else if (content.type === "tool_call") {
        // Tool calls are not inline in Responses API input
        continue
      }
    }

    // If only one text part, simplify to string
    const messageContent = contentParts.length === 1 && contentParts[0].type === "input_text"
      ? contentParts[0].text
      : contentParts

    if (contentParts.length > 0) {
      input.push({ role: msg.role, content: messageContent })
    }
  }

  // Build tools - flattened format
  const tools: any[] = []
  if (universal.tools) {
    for (const tool of universal.tools) {
      if (tool._original?.provider === "openai-responses") {
        tools.push(tool._original.raw)
      } else {
        tools.push({
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: tool.metadata?.strict,
        })
      }
    }
  }

  // Add built-in tools
  if (universal.provider_params?.builtin_tools) {
    tools.push(...(universal.provider_params.builtin_tools as any[]))
  }

  // Build result
  const result: OpenAIResponsesBody = {
    model: universal.model,
    input,
  }

  if (tools.length > 0) result.tools = tools
  if (universal.max_tokens !== undefined) result.max_output_tokens = universal.max_tokens
  if (universal.temperature !== undefined) result.temperature = universal.temperature
  if (universal.top_p !== undefined) result.top_p = universal.top_p
  if (universal.stream !== undefined) result.stream = universal.stream
  if (universal.tool_choice !== undefined) result.tool_choice = universal.tool_choice

  // Reasoning config
  if (universal.thinking?.enabled || universal.reasoning_effort) {
    result.reasoning = {
      ...(universal.reasoning_effort || universal.thinking?.effort ? { effort: universal.reasoning_effort || universal.thinking?.effort } : {}),
      ...(universal.provider_params?.reasoning_summary ? { summary: universal.provider_params.reasoning_summary } : {}),
    }
  }

  // Structured output → text.format
  if (universal.structured_output) {
    if (universal.structured_output.type === "json_schema" && universal.structured_output.json_schema) {
      result.text = {
        format: {
          type: "json_schema",
          name: universal.structured_output.json_schema.name,
          strict: universal.structured_output.json_schema.strict,
          schema: universal.structured_output.json_schema.schema,
        },
      }
    } else if (universal.structured_output.type === "json_object") {
      result.text = { format: { type: "json_object" } }
    }
  }

  // Provider-specific params
  if (universal.provider_params?.truncation !== undefined) result.truncation = universal.provider_params.truncation
  if (universal.provider_params?.store !== undefined) result.store = universal.provider_params.store
  if (universal.provider_params?.previous_response_id) result.previous_response_id = universal.provider_params.previous_response_id

  return result
}
