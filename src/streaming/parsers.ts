import { UniversalStreamEvent } from "../types/universal"

/**
 * Shared helper: parse a ReadableStream of SSE text into individual SSE events.
 * Yields objects with optional `event` (from "event:" lines) and `data` (from "data:" lines).
 */
async function* parseSSEStream(
  stream: ReadableStream,
): AsyncGenerator<{ event?: string; data: string }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n")
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || ""

      let currentEvent: string | undefined
      let currentData: string[] = []

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim())
        } else if (line.trim() === "" && currentData.length > 0) {
          // Empty line = end of SSE event
          yield { event: currentEvent, data: currentData.join("\n") }
          currentEvent = undefined
          currentData = []
        }
      }

      // If we have accumulated data without a trailing blank line,
      // keep it for the next iteration by not yielding yet
      if (currentData.length > 0) {
        // Reconstruct the unfinished event back into the buffer
        if (currentEvent) {
          buffer = `event: ${currentEvent}\n` + currentData.map(d => `data: ${d}`).join("\n") + "\n" + buffer
        } else {
          buffer = currentData.map(d => `data: ${d}`).join("\n") + "\n" + buffer
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const lines = buffer.split("\n")
      let currentEvent: string | undefined
      let currentData: string[] = []

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim()
        } else if (line.startsWith("data:")) {
          currentData.push(line.slice(5).trim())
        }
      }

      if (currentData.length > 0) {
        yield { event: currentEvent, data: currentData.join("\n") }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse an OpenAI Chat Completions SSE stream into universal stream events.
 */
export async function* parseOpenAIStream(
  stream: ReadableStream,
): AsyncGenerator<UniversalStreamEvent> {
  let sentStart = false
  let lastFinishReason: string | undefined
  const currentToolCalls: Map<number, { id: string; name: string }> = new Map()

  for await (const sse of parseSSEStream(stream)) {
    if (sse.data === "[DONE]") {
      yield { type: "message_end", stop_reason: lastFinishReason || "end_turn" }
      return
    }

    let chunk: any
    try {
      chunk = JSON.parse(sse.data)
    } catch {
      continue
    }

    // Emit message_start on first chunk
    if (!sentStart && (chunk.id || chunk.model)) {
      yield {
        type: "message_start",
        id: chunk.id || "",
        model: chunk.model || "",
      }
      sentStart = true
    }

    const choice = chunk.choices?.[0]
    if (choice) {
      const delta = choice.delta

      if (delta?.content) {
        yield {
          type: "content_delta",
          delta: { text: delta.content },
        }
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0

          if (tc.id && tc.function?.name) {
            // New tool call starting
            currentToolCalls.set(index, { id: tc.id, name: tc.function.name })
            yield {
              type: "tool_call_start",
              tool_call: { id: tc.id, name: tc.function.name },
            }
          }

          if (tc.function?.arguments) {
            const existing = currentToolCalls.get(index)
            if (existing) {
              yield {
                type: "tool_call_delta",
                tool_call: {
                  id: existing.id,
                  arguments_delta: tc.function.arguments,
                },
              }
            }
          }
        }
      }

      // Handle finish_reason to end tool calls
      if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
        for (const [, tc] of currentToolCalls) {
          yield { type: "tool_call_end", tool_call: { id: tc.id } }
        }
        currentToolCalls.clear()
      }
    }

    // Track the last finish_reason (needed when usage arrives in a separate chunk)
    if (choice?.finish_reason) {
      lastFinishReason = choice.finish_reason
    }

    // Handle usage in final chunk (may arrive separately from finish_reason)
    if (chunk.usage) {
      yield {
        type: "message_end",
        stop_reason: chunk.choices?.[0]?.finish_reason || lastFinishReason || "end_turn",
        usage: {
          input_tokens: chunk.usage.prompt_tokens ?? 0,
          output_tokens: chunk.usage.completion_tokens ?? 0,
        },
      }
      return
    }
  }

  // If stream ended without [DONE] or usage chunk, emit message_end with last known finish_reason
  if (sentStart) {
    yield { type: "message_end", stop_reason: lastFinishReason || "end_turn" }
  }
}

/**
 * Parse an Anthropic Messages SSE stream into universal stream events.
 */
export async function* parseAnthropicStream(
  stream: ReadableStream,
): AsyncGenerator<UniversalStreamEvent> {
  let currentBlockType: string | undefined
  let currentToolCallId: string | undefined
  let stopReason: string = "end_turn"
  let streamUsage: { input_tokens: number; output_tokens: number } | undefined

  for await (const sse of parseSSEStream(stream)) {
    let data: any
    try {
      data = JSON.parse(sse.data)
    } catch {
      continue
    }

    const eventType = sse.event || data.type

    switch (eventType) {
      case "message_start": {
        const msg = data.message || data
        yield {
          type: "message_start",
          id: msg.id || "",
          model: msg.model || "",
        }
        break
      }

      case "content_block_start": {
        const block = data.content_block
        if (block?.type === "tool_use") {
          currentBlockType = "tool_use"
          currentToolCallId = block.id
          yield {
            type: "tool_call_start",
            tool_call: { id: block.id, name: block.name },
          }
        } else if (block?.type === "thinking") {
          currentBlockType = "thinking"
        } else if (block?.type === "text") {
          currentBlockType = "text"
        } else {
          currentBlockType = block?.type
        }
        break
      }

      case "content_block_delta": {
        const delta = data.delta
        if (delta?.type === "text_delta") {
          yield {
            type: "content_delta",
            delta: { text: delta.text },
          }
        } else if (delta?.type === "thinking_delta") {
          yield {
            type: "content_delta",
            delta: { thinking: delta.thinking },
          }
        } else if (delta?.type === "input_json_delta") {
          if (currentToolCallId) {
            yield {
              type: "tool_call_delta",
              tool_call: {
                id: currentToolCallId,
                arguments_delta: delta.partial_json,
              },
            }
          }
        }
        break
      }

      case "content_block_stop": {
        if (currentBlockType === "tool_use" && currentToolCallId) {
          yield {
            type: "tool_call_end",
            tool_call: { id: currentToolCallId },
          }
          currentToolCallId = undefined
        }
        currentBlockType = undefined
        break
      }

      case "message_delta": {
        if (data.delta?.stop_reason) {
          stopReason = data.delta.stop_reason
        }
        // Anthropic sends usage data on message_delta, not message_stop
        if (data.usage) {
          streamUsage = {
            input_tokens: data.usage.input_tokens ?? 0,
            output_tokens: data.usage.output_tokens ?? 0,
          }
        }
        break
      }

      case "message_stop": {
        yield {
          type: "message_end",
          stop_reason: stopReason,
          ...(streamUsage
            ? { usage: streamUsage }
            : {}),
        }
        break
      }

      case "error": {
        yield {
          type: "error",
          error: {
            message: data.error?.message || "Unknown error",
            code: data.error?.type,
          },
        }
        break
      }
    }
  }
}

/**
 * Parse a Google Gemini SSE stream into universal stream events.
 */
export async function* parseGoogleStream(
  stream: ReadableStream,
): AsyncGenerator<UniversalStreamEvent> {
  let sentStart = false
  let toolCallCounter = 0
  let emittedEnd = false
  let lastUsageMetadata: any = null

  for await (const sse of parseSSEStream(stream)) {
    if (sse.data === "[DONE]") {
      break
    }

    let chunk: any
    try {
      chunk = JSON.parse(sse.data)
    } catch {
      continue
    }

    if (!sentStart) {
      yield {
        type: "message_start",
        id: `gemini-${Date.now()}`,
        model: chunk.modelVersion || "",
      }
      sentStart = true
    }

    const candidate = chunk.candidates?.[0]
    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          const callId = `call_${toolCallCounter++}`
          yield {
            type: "tool_call_start",
            tool_call: { id: callId, name: part.functionCall.name },
          }
          yield {
            type: "tool_call_delta",
            tool_call: {
              id: callId,
              arguments_delta: JSON.stringify(part.functionCall.args || {}),
            },
          }
          yield {
            type: "tool_call_end",
            tool_call: { id: callId },
          }
        } else if (part.thought === true && part.text) {
          yield {
            type: "content_delta",
            delta: { thinking: part.text },
          }
        } else if (part.text) {
          yield {
            type: "content_delta",
            delta: { text: part.text },
          }
        }
      }
    }

    // Track latest usageMetadata (Gemini 2.5+ sends cumulative counts on every chunk)
    if (chunk.usageMetadata) {
      lastUsageMetadata = chunk.usageMetadata
    }

    // Only emit message_end when finishReason is present (stream is actually done).
    // Do NOT trigger on usageMetadata alone — Gemini sends it on intermediate chunks too.
    if (!emittedEnd && candidate?.finishReason) {
      emittedEnd = true
      yield {
        type: "message_end",
        stop_reason: candidate.finishReason,
        ...(lastUsageMetadata
          ? {
              usage: {
                input_tokens: lastUsageMetadata.promptTokenCount ?? 0,
                output_tokens: lastUsageMetadata.candidatesTokenCount ?? 0,
              },
            }
          : {}),
      }
    }
  }

  // Safety net: if the stream ended without any finishReason chunk (e.g. provider
  // truncated the stream), emit message_end so consumers are not left hanging.
  if (!emittedEnd && sentStart) {
    yield { type: "message_end", stop_reason: "end_turn" }
  }
}

/**
 * Parse an OpenAI Responses API SSE stream into universal stream events.
 */
export async function* parseOpenAIResponsesStream(
  stream: ReadableStream,
): AsyncGenerator<UniversalStreamEvent> {
  // Track multiple concurrent function calls by output_index
  const activeFunctionCalls = new Map<number, string>()
  let lastFunctionCallId: string | undefined

  for await (const sse of parseSSEStream(stream)) {
    const eventType = sse.event

    let data: any
    try {
      data = JSON.parse(sse.data)
    } catch {
      continue
    }

    switch (eventType) {
      case "response.created": {
        yield {
          type: "message_start",
          id: data.response?.id || data.id || "",
          model: data.response?.model || data.model || "",
        }
        break
      }

      case "response.output_text.delta": {
        yield {
          type: "content_delta",
          delta: { text: data.delta || "" },
        }
        break
      }

      case "response.function_call_arguments.delta": {
        const outputIndex = data.output_index ?? 0
        const callId = activeFunctionCalls.get(outputIndex) || lastFunctionCallId
        if (callId) {
          yield {
            type: "tool_call_delta",
            tool_call: {
              id: callId,
              arguments_delta: data.delta || "",
            },
          }
        }
        break
      }

      case "response.output_item.added": {
        if (data.item?.type === "function_call") {
          const callId = data.item.call_id || data.item.id || ""
          const outputIndex = data.output_index ?? activeFunctionCalls.size
          activeFunctionCalls.set(outputIndex, callId)
          lastFunctionCallId = callId
          yield {
            type: "tool_call_start",
            tool_call: {
              id: callId,
              name: data.item.name || "",
            },
          }
        }
        break
      }

      case "response.output_item.done": {
        if (data.item?.type === "function_call") {
          const outputIndex = data.output_index ?? 0
          const callId = data.item.call_id || data.item.id || activeFunctionCalls.get(outputIndex) || ""
          yield {
            type: "tool_call_end",
            tool_call: { id: callId },
          }
          activeFunctionCalls.delete(outputIndex)
        }
        break
      }

      case "response.completed": {
        const usage = data.response?.usage
        yield {
          type: "message_end",
          stop_reason: data.response?.status || "completed",
          ...(usage
            ? {
                usage: {
                  input_tokens: usage.input_tokens ?? 0,
                  output_tokens: usage.output_tokens ?? 0,
                },
              }
            : {}),
        }
        break
      }

      case "error": {
        yield {
          type: "error",
          error: {
            message: data.error?.message || data.message || "Unknown error",
            code: data.error?.code || data.code,
          },
        }
        break
      }
    }
  }
}
