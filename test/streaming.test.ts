import { describe, it, expect } from "vitest"
import {
  parseOpenAIStream,
  parseAnthropicStream,
  parseGoogleStream,
  parseOpenAIResponsesStream,
} from "../src/streaming/parsers.js"
import {
  emitOpenAIStream,
  emitAnthropicStream,
  emitGoogleStream,
} from "../src/streaming/emitters.js"
import { UniversalStreamEvent } from "../src/types/universal.js"

function createSSEStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

async function readStreamAsText(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

async function* asyncIterableFromArray(
  events: UniversalStreamEvent[]
): AsyncGenerator<UniversalStreamEvent> {
  for (const event of events) {
    yield event
  }
}

describe("Streaming Parsers", () => {
  describe("OpenAI parser", () => {
    it("should parse content_delta events from OpenAI SSE stream", async () => {
      const sseText = [
        `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
        "",
        `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}`,
        "",
        `data: {"id":"chatcmpl-1","object":"chat.completion.chunk","model":"gpt-4","choices":[{"index":0,"delta":{"content":" world"},"finish_reason":null}]}`,
        "",
        `data: [DONE]`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseOpenAIStream(stream))

      // message_start
      expect(events[0]).toEqual({
        type: "message_start",
        id: "chatcmpl-1",
        model: "gpt-4",
      })

      // content deltas
      const contentDeltas = events.filter((e) => e.type === "content_delta")
      expect(contentDeltas).toHaveLength(2)
      expect(contentDeltas[0].delta.text).toBe("Hello")
      expect(contentDeltas[1].delta.text).toBe(" world")

      // message_end from [DONE]
      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.stop_reason).toBe("end_turn")
    })

    it("should parse tool call deltas from OpenAI SSE stream", async () => {
      // Build SSE lines with proper JSON encoding
      const chunk1 = JSON.stringify({id:"chatcmpl-2",model:"gpt-4",choices:[{index:0,delta:{role:"assistant"},finish_reason:null}]})
      const chunk2 = JSON.stringify({id:"chatcmpl-2",model:"gpt-4",choices:[{index:0,delta:{tool_calls:[{index:0,id:"call_abc",type:"function",function:{name:"get_weather",arguments:""}}]},finish_reason:null}]})
      const chunk3 = JSON.stringify({id:"chatcmpl-2",model:"gpt-4",choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'{"loc'}}]},finish_reason:null}]})
      const chunk4 = JSON.stringify({id:"chatcmpl-2",model:"gpt-4",choices:[{index:0,delta:{tool_calls:[{index:0,function:{arguments:'ation":"NYC"}'}}]},finish_reason:null}]})
      const chunk5 = JSON.stringify({id:"chatcmpl-2",model:"gpt-4",choices:[{index:0,delta:{},finish_reason:"tool_calls"}]})
      const sseText = [
        `data: ${chunk1}`,
        "",
        `data: ${chunk2}`,
        "",
        `data: ${chunk3}`,
        "",
        `data: ${chunk4}`,
        "",
        `data: ${chunk5}`,
        "",
        `data: [DONE]`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseOpenAIStream(stream))

      const toolCallStart = events.find((e) => e.type === "tool_call_start")
      expect(toolCallStart).toBeDefined()
      expect(toolCallStart!.tool_call.id).toBe("call_abc")
      expect(toolCallStart!.tool_call.name).toBe("get_weather")

      const toolCallDeltas = events.filter((e) => e.type === "tool_call_delta")
      expect(toolCallDeltas.length).toBeGreaterThanOrEqual(2)
      expect(toolCallDeltas[0].tool_call.id).toBe("call_abc")

      const toolCallEnd = events.find((e) => e.type === "tool_call_end")
      expect(toolCallEnd).toBeDefined()
      expect(toolCallEnd!.tool_call.id).toBe("call_abc")
    })

    it("should parse data: [DONE] as message_end", async () => {
      const sseText = [
        `data: {"id":"chatcmpl-3","model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}`,
        "",
        `data: [DONE]`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseOpenAIStream(stream))

      const lastEvent = events[events.length - 1]
      expect(lastEvent.type).toBe("message_end")
      expect(lastEvent.stop_reason).toBe("end_turn")
    })
  })

  describe("Anthropic parser", () => {
    it("should parse message_start event", async () => {
      const sseText = [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"claude-3-5-sonnet","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}`,
        "",
        `event: message_stop`,
        `data: {"type":"message_stop"}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseAnthropicStream(stream))

      expect(events[0]).toEqual({
        type: "message_start",
        id: "msg_01",
        model: "claude-3-5-sonnet",
      })
    })

    it("should parse content_block_delta with text_delta", async () => {
      const sseText = [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"msg_02","model":"claude-3-5-sonnet","content":[]}}`,
        "",
        `event: content_block_start`,
        `data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`,
        "",
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}`,
        "",
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}`,
        "",
        `event: content_block_stop`,
        `data: {"type":"content_block_stop","index":0}`,
        "",
        `event: message_delta`,
        `data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}`,
        "",
        `event: message_stop`,
        `data: {"type":"message_stop"}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseAnthropicStream(stream))

      const contentDeltas = events.filter((e) => e.type === "content_delta")
      expect(contentDeltas).toHaveLength(2)
      expect(contentDeltas[0].delta.text).toBe("Hi")
      expect(contentDeltas[1].delta.text).toBe(" there")

      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.stop_reason).toBe("end_turn")
    })

    it("should parse thinking deltas", async () => {
      const sseText = [
        `event: message_start`,
        `data: {"type":"message_start","message":{"id":"msg_03","model":"claude-3-5-sonnet","content":[]}}`,
        "",
        `event: content_block_start`,
        `data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}`,
        "",
        `event: content_block_delta`,
        `data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}`,
        "",
        `event: content_block_stop`,
        `data: {"type":"content_block_stop","index":0}`,
        "",
        `event: message_delta`,
        `data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}`,
        "",
        `event: message_stop`,
        `data: {"type":"message_stop"}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseAnthropicStream(stream))

      const thinkingDelta = events.find(
        (e) => e.type === "content_delta" && e.delta.thinking
      )
      expect(thinkingDelta).toBeDefined()
      expect(thinkingDelta!.delta.thinking).toBe("Let me think...")
    })
  })

  describe("Google parser", () => {
    it("should parse content_delta from Google SSE stream", async () => {
      const sseText = [
        `data: {"candidates":[{"content":{"parts":[{"text":"Hi"}],"role":"model"}}]}`,
        "",
        `data: {"candidates":[{"content":{"parts":[{"text":" there"}],"role":"model"}}]}`,
        "",
        `data: {"candidates":[{"content":{"parts":[],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":2,"totalTokenCount":7}}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseGoogleStream(stream))

      // message_start on first chunk
      expect(events[0].type).toBe("message_start")
      expect(events[0].id).toMatch(/^gemini-/)

      const contentDeltas = events.filter((e) => e.type === "content_delta")
      expect(contentDeltas).toHaveLength(2)
      expect(contentDeltas[0].delta.text).toBe("Hi")
      expect(contentDeltas[1].delta.text).toBe(" there")

      // message_end with usage
      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.usage).toEqual({
        input_tokens: 5,
        output_tokens: 2,
      })
    })

    it("should emit message_end with finishReason but no usageMetadata", async () => {
      const sseText = [
        `data: {"candidates":[{"content":{"parts":[{"text":"Hello"}],"role":"model"}}]}`,
        "",
        `data: {"candidates":[{"content":{"parts":[],"role":"model"},"finishReason":"STOP"}]}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseGoogleStream(stream))

      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.stop_reason).toBe("STOP")
      // No usage since no usageMetadata was present
      expect(messageEnd!.usage).toBeUndefined()
    })

    it("should emit message_end even if stream ends without finishReason or usageMetadata", async () => {
      const sseText = [
        `data: {"candidates":[{"content":{"parts":[{"text":"Partial"}],"role":"model"}}]}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseGoogleStream(stream))

      // Safety net: should still emit message_end
      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.stop_reason).toBe("end_turn")
    })
  })

  describe("OpenAI Responses parser", () => {
    it("should parse response.created and text delta events", async () => {
      const sseText = [
        `event: response.created`,
        `data: {"response":{"id":"resp_01","model":"gpt-4o","status":"in_progress"}}`,
        "",
        `event: response.output_text.delta`,
        `data: {"delta":"Hello"}`,
        "",
        `event: response.output_text.delta`,
        `data: {"delta":" world"}`,
        "",
        `event: response.completed`,
        `data: {"response":{"id":"resp_01","status":"completed","usage":{"input_tokens":10,"output_tokens":5}}}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseOpenAIResponsesStream(stream))

      expect(events[0]).toEqual({
        type: "message_start",
        id: "resp_01",
        model: "gpt-4o",
      })

      const contentDeltas = events.filter((e) => e.type === "content_delta")
      expect(contentDeltas).toHaveLength(2)
      expect(contentDeltas[0].delta.text).toBe("Hello")
      expect(contentDeltas[1].delta.text).toBe(" world")

      const messageEnd = events.find((e) => e.type === "message_end")
      expect(messageEnd).toBeDefined()
      expect(messageEnd!.stop_reason).toBe("completed")
      expect(messageEnd!.usage).toEqual({
        input_tokens: 10,
        output_tokens: 5,
      })
    })

    it("should parse function call events", async () => {
      const argDelta1 = JSON.stringify({ delta: '{"loc' })
      const argDelta2 = JSON.stringify({ delta: 'ation":"NYC"}' })
      const sseText = [
        `event: response.created`,
        `data: {"response":{"id":"resp_02","model":"gpt-4o"}}`,
        "",
        `event: response.output_item.added`,
        `data: {"item":{"type":"function_call","call_id":"call_xyz","name":"get_weather"}}`,
        "",
        `event: response.function_call_arguments.delta`,
        `data: ${argDelta1}`,
        "",
        `event: response.function_call_arguments.delta`,
        `data: ${argDelta2}`,
        "",
        `event: response.output_item.done`,
        `data: {"item":{"type":"function_call","call_id":"call_xyz"}}`,
        "",
        `event: response.completed`,
        `data: {"response":{"id":"resp_02","status":"completed"}}`,
        "",
      ].join("\n")

      const stream = createSSEStream(sseText)
      const events = await collectEvents(parseOpenAIResponsesStream(stream))

      const toolStart = events.find((e) => e.type === "tool_call_start")
      expect(toolStart).toBeDefined()
      expect(toolStart!.tool_call.id).toBe("call_xyz")
      expect(toolStart!.tool_call.name).toBe("get_weather")

      const toolDeltas = events.filter((e) => e.type === "tool_call_delta")
      expect(toolDeltas).toHaveLength(2)
      expect(toolDeltas[0].tool_call.id).toBe("call_xyz")

      const toolEnd = events.find((e) => e.type === "tool_call_end")
      expect(toolEnd).toBeDefined()
      expect(toolEnd!.tool_call.id).toBe("call_xyz")
    })
  })
})

describe("Streaming Emitters", () => {
  describe("OpenAI emitter", () => {
    it("should emit OpenAI SSE format from universal events", async () => {
      const events: UniversalStreamEvent[] = [
        { type: "message_start", id: "chatcmpl-test", model: "gpt-4" },
        { type: "content_delta", delta: { text: "Hello" } },
        { type: "content_delta", delta: { text: " world" } },
        { type: "message_end", stop_reason: "end_turn" },
      ]

      const stream = emitOpenAIStream(asyncIterableFromArray(events))
      const output = await readStreamAsText(stream)

      // Should contain data: lines
      expect(output).toContain("data: ")
      // Should end with [DONE]
      expect(output).toContain("data: [DONE]")

      // Parse the SSE lines
      const dataLines = output
        .split("\n")
        .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
        .map((l) => JSON.parse(l.slice(6)))

      // First chunk: role: assistant
      expect(dataLines[0].id).toBe("chatcmpl-test")
      expect(dataLines[0].model).toBe("gpt-4")
      expect(dataLines[0].choices[0].delta.role).toBe("assistant")

      // Content chunks
      expect(dataLines[1].choices[0].delta.content).toBe("Hello")
      expect(dataLines[2].choices[0].delta.content).toBe(" world")

      // Final chunk: finish_reason
      expect(dataLines[3].choices[0].finish_reason).toBe("stop")
    })
  })

  describe("Anthropic emitter", () => {
    it("should emit Anthropic SSE format with event: prefixes", async () => {
      const events: UniversalStreamEvent[] = [
        { type: "message_start", id: "msg_test", model: "claude-3-5-sonnet" },
        { type: "content_delta", delta: { text: "Hi" } },
        { type: "message_end", stop_reason: "end_turn" },
      ]

      const stream = emitAnthropicStream(asyncIterableFromArray(events))
      const output = await readStreamAsText(stream)

      // Anthropic format uses event: prefixes
      expect(output).toContain("event: message_start")
      expect(output).toContain("event: content_block_delta")
      expect(output).toContain("event: message_delta")
      expect(output).toContain("event: message_stop")

      // Parse data lines from event: message_start block
      const lines = output.split("\n")
      const messageStartDataLine = lines.find(
        (l, i) =>
          l.startsWith("data: ") &&
          i > 0 &&
          lines[i - 1] === "event: message_start"
      )
      expect(messageStartDataLine).toBeDefined()
      const msgStartData = JSON.parse(messageStartDataLine!.slice(6))
      expect(msgStartData.message.id).toBe("msg_test")
      expect(msgStartData.message.model).toBe("claude-3-5-sonnet")

      // Check content block delta
      const contentDeltaDataLine = lines.find(
        (l, i) =>
          l.startsWith("data: ") &&
          i > 0 &&
          lines[i - 1] === "event: content_block_delta"
      )
      expect(contentDeltaDataLine).toBeDefined()
      const deltaData = JSON.parse(contentDeltaDataLine!.slice(6))
      expect(deltaData.delta.type).toBe("text_delta")
      expect(deltaData.delta.text).toBe("Hi")
    })
  })

  describe("Google emitter", () => {
    it("should emit Google SSE format from universal events", async () => {
      const events: UniversalStreamEvent[] = [
        { type: "message_start", id: "gemini-test", model: "gemini-pro" },
        { type: "content_delta", delta: { text: "Hi" } },
        {
          type: "message_end",
          stop_reason: "end_turn",
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      ]

      const stream = emitGoogleStream(asyncIterableFromArray(events))
      const output = await readStreamAsText(stream)

      // Should contain data: lines
      expect(output).toContain("data: ")

      const dataLines = output
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => JSON.parse(l.slice(6)))

      // Content chunk
      const contentChunk = dataLines.find(
        (d) => d.candidates?.[0]?.content?.parts?.[0]?.text === "Hi"
      )
      expect(contentChunk).toBeDefined()
      expect(contentChunk.candidates[0].content.role).toBe("model")

      // End chunk with usage metadata
      const endChunk = dataLines.find((d) => d.usageMetadata)
      expect(endChunk).toBeDefined()
      expect(endChunk.usageMetadata.promptTokenCount).toBe(5)
      expect(endChunk.usageMetadata.candidatesTokenCount).toBe(2)
    })
  })
})

describe("Streaming Round-trip", () => {
  it("should parse OpenAI stream and re-emit as Anthropic stream", async () => {
    // Create OpenAI SSE stream
    const openaiSSE = [
      `data: {"id":"chatcmpl-rt","model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
      "",
      `data: {"id":"chatcmpl-rt","model":"gpt-4","choices":[{"index":0,"delta":{"content":"Round-trip test"},"finish_reason":null}]}`,
      "",
      `data: [DONE]`,
      "",
    ].join("\n")

    const openaiStream = createSSEStream(openaiSSE)

    // Parse OpenAI → universal events
    const universalEvents = await collectEvents(
      parseOpenAIStream(openaiStream)
    )

    expect(universalEvents.length).toBeGreaterThanOrEqual(2)

    // Emit as Anthropic stream
    const anthropicStream = emitAnthropicStream(
      asyncIterableFromArray(universalEvents)
    )
    const anthropicOutput = await readStreamAsText(anthropicStream)

    // Verify Anthropic format
    expect(anthropicOutput).toContain("event: message_start")
    expect(anthropicOutput).toContain("event: content_block_delta")
    expect(anthropicOutput).toContain("event: message_stop")

    // Verify content is preserved
    expect(anthropicOutput).toContain("Round-trip test")
  })

  it("should handle OpenAI stream without [DONE] marker", async () => {
    const sseText = [
      `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}`,
      `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}`,
      `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
      "", // stream ends without [DONE]
    ].join("\n\n")

    const stream = createSSEStream(sseText)
    const events = await collectEvents(parseOpenAIStream(stream))

    // Should still emit message_end with correct stop reason
    const messageEnd = events.find((e: any) => e.type === "message_end")
    expect(messageEnd).toBeDefined()
    expect(messageEnd.stop_reason).toBe("stop")
  })

  it("should handle OpenAI stream with usage chunk (no double message_end)", async () => {
    const sseText = [
      `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}`,
      `data: {"id":"chatcmpl-1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}`,
      `data: [DONE]`,
    ].join("\n\n")

    const stream = createSSEStream(sseText)
    const events = await collectEvents(parseOpenAIStream(stream))

    // Should emit exactly one message_end (from usage chunk, not [DONE])
    const messageEnds = events.filter((e: any) => e.type === "message_end")
    expect(messageEnds).toHaveLength(1)
    expect(messageEnds[0].stop_reason).toBe("stop")
    expect(messageEnds[0].usage).toEqual({ input_tokens: 10, output_tokens: 5 })
  })

  it("should handle Anthropic emitter with multiple thinking deltas in one block", async () => {
    const universalEvents: UniversalStreamEvent[] = [
      { type: "message_start", id: "msg_1", model: "claude-sonnet-4-20250514" },
      { type: "content_delta", delta: { thinking: "Let me think" } },
      { type: "content_delta", delta: { thinking: " about this" } },
      { type: "content_delta", delta: { thinking: " carefully." } },
      { type: "content_delta", delta: { text: "Here is my answer." } },
      { type: "message_end", stop_reason: "end_turn" },
    ]

    const stream = emitAnthropicStream(asyncIterableFromArray(universalEvents))
    const output = await readStreamAsText(stream)

    // Should have exactly ONE thinking content_block_start (not three)
    const thinkingStarts = (output.match(/content_block_start.*"type":"thinking"/g) || [])
    expect(thinkingStarts).toHaveLength(1)

    // Should have three thinking deltas within that block
    const thinkingDeltas = (output.match(/thinking_delta/g) || [])
    expect(thinkingDeltas).toHaveLength(3)

    // Should have a text block start too
    const textStarts = (output.match(/content_block_start.*"type":"text"/g) || [])
    expect(textStarts).toHaveLength(1)
  })

  it("should handle Anthropic emitter with sequential tool calls", async () => {
    const universalEvents: UniversalStreamEvent[] = [
      { type: "message_start", id: "msg_1", model: "claude-sonnet-4-20250514" },
      { type: "tool_call_start", tool_call: { id: "call_1", name: "get_weather" } },
      { type: "tool_call_delta", tool_call: { id: "call_1", arguments_delta: '{"loc":"SF"}' } },
      { type: "tool_call_end", tool_call: { id: "call_1" } },
      { type: "tool_call_start", tool_call: { id: "call_2", name: "get_time" } },
      { type: "tool_call_delta", tool_call: { id: "call_2", arguments_delta: '{"tz":"PST"}' } },
      { type: "tool_call_end", tool_call: { id: "call_2" } },
      { type: "message_end", stop_reason: "tool_use" },
    ]

    const stream = emitAnthropicStream(asyncIterableFromArray(universalEvents))
    const output = await readStreamAsText(stream)

    // Should have two tool_use content_block_start events
    const toolStarts = (output.match(/content_block_start.*"type":"tool_use"/g) || [])
    expect(toolStarts).toHaveLength(2)

    // Both tool calls should be present
    expect(output).toContain("get_weather")
    expect(output).toContain("get_time")
    expect(output).toContain("call_1")
    expect(output).toContain("call_2")
  })

  it("should handle OpenAI Responses parser with multiple concurrent function calls", async () => {
    const sseText = [
      `event: response.created\ndata: {"response":{"id":"resp_1","model":"gpt-4o"}}`,
      `event: response.output_item.added\ndata: {"output_index":0,"item":{"type":"function_call","call_id":"fc_1","name":"get_weather"}}`,
      `event: response.output_item.added\ndata: {"output_index":1,"item":{"type":"function_call","call_id":"fc_2","name":"get_time"}}`,
      `event: response.function_call_arguments.delta\ndata: {"output_index":0,"delta":"{\\"loc\\":\\"SF\\"}"}`,
      `event: response.function_call_arguments.delta\ndata: {"output_index":1,"delta":"{\\"tz\\":\\"PST\\"}"}`,
      `event: response.output_item.done\ndata: {"output_index":0,"item":{"type":"function_call","call_id":"fc_1"}}`,
      `event: response.output_item.done\ndata: {"output_index":1,"item":{"type":"function_call","call_id":"fc_2"}}`,
      `event: response.completed\ndata: {"response":{"status":"completed","usage":{"input_tokens":20,"output_tokens":15}}}`,
    ].join("\n\n")

    const stream = createSSEStream(sseText)
    const events = await collectEvents(parseOpenAIResponsesStream(stream))

    // Should have two tool_call_start events
    const starts = events.filter((e: any) => e.type === "tool_call_start")
    expect(starts).toHaveLength(2)
    expect(starts[0].tool_call.id).toBe("fc_1")
    expect(starts[1].tool_call.id).toBe("fc_2")

    // Deltas should be attributed to correct function calls
    const deltas = events.filter((e: any) => e.type === "tool_call_delta")
    expect(deltas).toHaveLength(2)
    expect(deltas[0].tool_call.id).toBe("fc_1")
    expect(deltas[1].tool_call.id).toBe("fc_2")

    // Should have two tool_call_end events
    const ends = events.filter((e: any) => e.type === "tool_call_end")
    expect(ends).toHaveLength(2)
  })
})
