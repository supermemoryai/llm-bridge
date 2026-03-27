/**
 * Critical-fixes test suite
 *
 * Tests the EXACT failure modes the PR claims to fix:
 *   1. Anthropic thinking `signature` field preserved in universal ↔ Anthropic roundtrip
 *   2. Cross-provider thinking signature preserved via slow path (no anthropic _original)
 *   3. OpenAI Responses API emitter uses named SSE events (NOT chat completion chunks)
 *   4. Responses API emitter tool-call events are correct
 *   5. Anthropic emitter sequential tool calls use correct block indices
 *   6. Anthropic emitter thinking→text transitions use correct block indices
 */

import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"
import {
  emitOpenAIResponsesStream,
  emitAnthropicStream,
} from "../src/streaming/emitters.js"
import { UniversalStreamEvent } from "../src/types/universal.js"

// ─── helpers ──────────────────────────────────────────────────────────────────

async function readStream(stream: ReadableStream): Promise<string> {
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

async function* makeEvents(
  events: UniversalStreamEvent[],
): AsyncGenerator<UniversalStreamEvent> {
  for (const e of events) yield e
}

/** Parse all SSE data lines from raw SSE text, keyed by preceding event: line */
function parseSseOutput(raw: string): {
  dataLines: any[]
  byEvent: Record<string, any[]>
} {
  const lines = raw.split("\n")
  const dataLines: any[] = []
  const byEvent: Record<string, any[]> = {}
  let lastEvent: string | undefined

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      lastEvent = line.slice(7)
    } else if (line.startsWith("data: ")) {
      try {
        const parsed = JSON.parse(line.slice(6))
        dataLines.push(parsed)
        if (lastEvent) {
          byEvent[lastEvent] = byEvent[lastEvent] ?? []
          byEvent[lastEvent].push(parsed)
        }
        lastEvent = undefined
      } catch {
        // non-JSON data lines (e.g. [DONE])
      }
    }
  }
  return { dataLines, byEvent }
}

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #1: Anthropic thinking signature
// Memory knowledge explicitly states: "the signature field MUST be preserved on
// the thinking block — otherwise the Anthropic API will reject the request"
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #1: Anthropic thinking signature (named fix)", () => {
  const SIGNATURE = "WaUjzkypQ2mUEVM36O2TxuC06KN8xEegnoOrpBVzqnK3HVGkSb3dNFPJUVK"

  const anthropicBodyWithSignature = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 16000,
    messages: [
      { role: "user" as const, content: "Solve a hard problem." },
      {
        role: "assistant" as const,
        content: [
          {
            type: "thinking" as const,
            thinking: "Let me think carefully about this.",
            signature: SIGNATURE,
          } as any,
          { type: "text" as const, text: "Here is my answer." },
        ],
      },
      { role: "user" as const, content: "Follow-up question." },
    ],
  }

  it("toUniversal: preserves signature on universal thinking content block", () => {
    const universal = toUniversal("anthropic", anthropicBodyWithSignature)
    const assistantMsg = universal.messages[1]
    const thinkingBlock = assistantMsg.content[0]

    expect(thinkingBlock.type).toBe("thinking")
    expect(thinkingBlock.thinking).toBe("Let me think carefully about this.")
    // THE CRITICAL ASSERTION — without this the roundtrip fails
    expect((thinkingBlock as any).signature).toBe(SIGNATURE)
  })

  it("fromUniversal: signature present in Anthropic output (multi-turn API requirement)", () => {
    const universal = toUniversal("anthropic", anthropicBodyWithSignature)
    const backToAnthropic = fromUniversal("anthropic", universal) as any
    const outBlock = backToAnthropic.messages[1].content[0]

    expect(outBlock.type).toBe("thinking")
    expect(outBlock.thinking).toBe("Let me think carefully about this.")
    // Without this, Anthropic API returns: "thinking block missing signature"
    expect(outBlock.signature).toBe(SIGNATURE)
  })

  it("full roundtrip: toUniversal → fromUniversal preserves signature end-to-end", () => {
    const universal = toUniversal("anthropic", anthropicBodyWithSignature)

    // Verify signature is in universal
    expect((universal.messages[1].content[0] as any).signature).toBe(SIGNATURE)

    // Verify signature survives the full roundtrip
    const result = fromUniversal("anthropic", universal) as any
    expect(result.messages[1].content[0].signature).toBe(SIGNATURE)
  })

  it("toUniversal: thinking block WITHOUT signature still works (no regression)", () => {
    const bodyWithoutSig = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        { role: "user" as const, content: "Question." },
        {
          role: "assistant" as const,
          content: [
            {
              type: "thinking" as const,
              thinking: "I need to think.",
              // No signature — first turn, Anthropic doesn't include it yet
            } as any,
            { type: "text" as const, text: "Answer." },
          ],
        },
      ],
    }
    const universal = toUniversal("anthropic", bodyWithoutSig)
    const block = universal.messages[1].content[0]
    expect(block.type).toBe("thinking")
    expect(block.thinking).toBe("I need to think.")
    // Should be undefined, not throw
    expect((block as any).signature).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #1b: Cross-provider thinking → Anthropic (slow path, no anthropic _original)
// When a thinking block was parsed from a non-Anthropic provider (e.g. Google),
// the fromUniversal("anthropic") must still include the signature via the slow path.
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #1b: Cross-provider thinking signature (slow path, _original not anthropic)", () => {
  it("preserves signature when _original.provider is 'google' (slow path in anthropic-format)", () => {
    // This simulates a thinking block that was parsed from Google's stream
    // and is now being sent to Anthropic. The _original.provider is "google",
    // so the fast-path shortcut (return _original.raw) does NOT fire.
    // The slow path at anthropic-format/index.ts lines 281-286 must emit signature.
    const crossProviderUniversal = {
      provider: "anthropic" as const,
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user" as const,
          content: [
            {
              _original: { provider: "openai" as const, raw: "Question" },
              text: "Question",
              type: "text" as const,
            },
          ],
          id: "m0",
          metadata: { provider: "anthropic" as const, originalIndex: 0 },
        },
        {
          role: "assistant" as const,
          content: [
            {
              // _original.provider is "google" — forces the SLOW PATH in universalToAnthropic
              _original: {
                provider: "google" as const,
                raw: { thought: true, text: "thinking..." },
              },
              thinking: "thinking...",
              signature: "CrossProviderSig12345",
              type: "thinking" as const,
            } as any,
            {
              _original: { provider: "google" as const, raw: { text: "answer" } },
              text: "answer",
              type: "text" as const,
            },
          ],
          id: "m1",
          metadata: { provider: "anthropic" as const, originalIndex: 1 },
        },
      ],
    }

    const result = fromUniversal("anthropic", crossProviderUniversal as any) as any
    const outBlock = result.messages[1].content[0]

    expect(outBlock.type).toBe("thinking")
    // THE CRITICAL ASSERTION: slow path must include signature
    expect(outBlock.signature).toBe("CrossProviderSig12345")
    expect(outBlock.thinking).toBe("thinking...")
  })

  it("no signature on cross-provider thinking block → signature absent (not null)", () => {
    const crossProviderUniversal = {
      provider: "anthropic" as const,
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user" as const,
          content: [{ _original: { provider: "openai" as const, raw: "Q" }, text: "Q", type: "text" as const }],
          id: "m0",
          metadata: { provider: "anthropic" as const, originalIndex: 0 },
        },
        {
          role: "assistant" as const,
          content: [
            {
              _original: { provider: "google" as const, raw: { thought: true, text: "thinking" } },
              thinking: "thinking",
              // No signature — should NOT inject a null/undefined field
              type: "thinking" as const,
            } as any,
          ],
          id: "m1",
          metadata: { provider: "anthropic" as const, originalIndex: 1 },
        },
      ],
    }

    const result = fromUniversal("anthropic", crossProviderUniversal as any) as any
    const outBlock = result.messages[1].content[0]
    expect(outBlock.type).toBe("thinking")
    // signature must be absent (not `signature: undefined` which some serializers keep)
    expect("signature" in outBlock).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #2: OpenAI Responses API stream emitter
// The PR explicitly lists: "OpenAI Responses API stream emitter fix"
// The emitter must use named SSE events (response.created, etc.)
// NOT the chat completion chunk format (choices[], chat.completion.chunk)
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #2: OpenAI Responses API emitter (named fix)", () => {
  it("emits named SSE events, NOT chat completion chunk format", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "resp_001", model: "gpt-4o" },
      { type: "content_delta", delta: { text: "Hello" } },
      { type: "content_delta", delta: { text: " world" } },
      {
        type: "message_end",
        stop_reason: "completed",
        usage: { input_tokens: 10, output_tokens: 2 },
      },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))

    // MUST have Responses API named events
    expect(output).toContain("event: response.created")
    expect(output).toContain("event: response.output_text.delta")
    expect(output).toContain("event: response.output_item.added")
    expect(output).toContain("event: response.completed")

    // MUST NOT look like Chat Completions format
    expect(output).not.toContain('"object":"chat.completion.chunk"')
    expect(output).not.toContain('"choices"')
    expect(output).not.toContain("data: [DONE]")
  })

  it("response.created event has correct structure", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "resp_test_id", model: "gpt-4o-mini" },
      { type: "message_end", stop_reason: "completed" },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))
    const { byEvent } = parseSseOutput(output)

    const created = byEvent["response.created"]?.[0]
    expect(created).toBeDefined()
    expect(created?.response?.id).toBe("resp_test_id")
    expect(created?.response?.model).toBe("gpt-4o-mini")
    expect(created?.response?.status).toBe("in_progress")
    expect(created?.response?.object).toBe("response")
  })

  it("response.output_text.delta events carry delta text correctly", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "r1", model: "gpt-4o" },
      { type: "content_delta", delta: { text: "Alpha" } },
      { type: "content_delta", delta: { text: "Beta" } },
      { type: "content_delta", delta: { text: "Gamma" } },
      { type: "message_end", stop_reason: "completed" },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))
    const { byEvent } = parseSseOutput(output)

    const textDeltas = byEvent["response.output_text.delta"] ?? []
    expect(textDeltas).toHaveLength(3)
    expect(textDeltas[0].delta).toBe("Alpha")
    expect(textDeltas[1].delta).toBe("Beta")
    expect(textDeltas[2].delta).toBe("Gamma")
  })

  it("response.completed event has usage and status=completed", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "r2", model: "gpt-4o" },
      { type: "message_end", stop_reason: "completed", usage: { input_tokens: 15, output_tokens: 7 } },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))
    const { byEvent } = parseSseOutput(output)

    const completed = byEvent["response.completed"]?.[0]
    expect(completed).toBeDefined()
    expect(completed?.response?.status).toBe("completed")
    expect(completed?.response?.usage?.input_tokens).toBe(15)
    expect(completed?.response?.usage?.output_tokens).toBe(7)
    expect(completed?.response?.usage?.total_tokens).toBe(22)
  })

  it("emits response.output_text.done and response.output_item.done at message_end", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "r3", model: "gpt-4o" },
      { type: "content_delta", delta: { text: "Some text." } },
      { type: "message_end", stop_reason: "completed" },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))
    expect(output).toContain("event: response.output_text.done")
    expect(output).toContain("event: response.output_item.done")

    const { byEvent } = parseSseOutput(output)
    const textDone = byEvent["response.output_text.done"]?.[0]
    expect(textDone?.text).toBe("Some text.")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #2b: Responses API emitter — tool call events
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #2b: Responses API emitter — tool call SSE events", () => {
  it("emits function_call events with correct structure and accumulated arguments", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "resp_tc", model: "gpt-4o" },
      { type: "tool_call_start", tool_call: { id: "call_abc", name: "get_weather" } },
      { type: "tool_call_delta", tool_call: { id: "call_abc", arguments_delta: '{"location":' } },
      { type: "tool_call_delta", tool_call: { id: "call_abc", arguments_delta: '"NYC"}' } },
      { type: "tool_call_end", tool_call: { id: "call_abc" } },
      { type: "message_end", stop_reason: "completed" },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))
    const { byEvent } = parseSseOutput(output)

    // Must have the four Responses API function call events
    expect(byEvent["response.output_item.added"]).toBeDefined()
    expect(byEvent["response.function_call_arguments.delta"]).toBeDefined()
    expect(byEvent["response.function_call_arguments.done"]).toBeDefined()
    expect(byEvent["response.output_item.done"]).toBeDefined()

    // output_item.added must describe the function_call item
    const fcAddedItems = (byEvent["response.output_item.added"] ?? [])
      .filter((d: any) => d.item?.type === "function_call")
    expect(fcAddedItems).toHaveLength(1)
    expect(fcAddedItems[0].item.call_id).toBe("call_abc")
    expect(fcAddedItems[0].item.name).toBe("get_weather")

    // arguments.done must have the fully accumulated argument string
    const argsDone = byEvent["response.function_call_arguments.done"]?.[0]
    expect(argsDone).toBeDefined()
    expect(argsDone?.arguments).toBe('{"location":"NYC"}')

    // output_item.done for the function_call
    const fcDoneItems = (byEvent["response.output_item.done"] ?? [])
      .filter((d: any) => d.item?.type === "function_call")
    expect(fcDoneItems).toHaveLength(1)
    expect(fcDoneItems[0].item.arguments).toBe('{"location":"NYC"}')
  })

  it("text followed by tool call: closes text item before opening function_call item", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "resp_mixed", model: "gpt-4o" },
      { type: "content_delta", delta: { text: "Let me check." } },
      { type: "tool_call_start", tool_call: { id: "call_1", name: "search" } },
      { type: "tool_call_delta", tool_call: { id: "call_1", arguments_delta: '{"q":"test"}' } },
      { type: "tool_call_end", tool_call: { id: "call_1" } },
      { type: "message_end", stop_reason: "completed" },
    ]

    const output = await readStream(emitOpenAIResponsesStream(makeEvents(events)))

    // Text done must appear BEFORE the function_call output_item.added
    const textDonePos = output.indexOf("response.output_text.done")
    const fcTypePos = output.indexOf('"type":"function_call"')
    expect(textDonePos).toBeGreaterThan(0)
    expect(fcTypePos).toBeGreaterThan(0)
    expect(textDonePos).toBeLessThan(fcTypePos)

    const { byEvent } = parseSseOutput(output)
    const textDone = byEvent["response.output_text.done"]?.[0]
    expect(textDone?.text).toBe("Let me check.")
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #3: Anthropic emitter — sequential tool calls → correct block indices
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #3: Anthropic emitter — sequential tool call block indices", () => {
  it("assigns index=0 to first tool and index=1 to second tool", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "msg_seq", model: "claude-sonnet-4-20250514" },
      { type: "tool_call_start", tool_call: { id: "call_1", name: "get_weather" } },
      { type: "tool_call_delta", tool_call: { id: "call_1", arguments_delta: '{"city":"SF"}' } },
      { type: "tool_call_end", tool_call: { id: "call_1" } },
      { type: "tool_call_start", tool_call: { id: "call_2", name: "get_time" } },
      { type: "tool_call_delta", tool_call: { id: "call_2", arguments_delta: '{"tz":"PST"}' } },
      { type: "tool_call_end", tool_call: { id: "call_2" } },
      { type: "message_end", stop_reason: "tool_use" },
    ]

    const output = await readStream(emitAnthropicStream(makeEvents(events)))
    const { dataLines } = parseSseOutput(output)

    const blockStarts = dataLines.filter((d: any) => d.type === "content_block_start")
    const blockStops = dataLines.filter((d: any) => d.type === "content_block_stop")
    const allDeltas = dataLines.filter((d: any) => d.type === "content_block_delta")

    expect(blockStarts).toHaveLength(2)
    expect(blockStops).toHaveLength(2)

    // First tool call
    expect(blockStarts[0].index).toBe(0)
    expect(blockStarts[0].content_block.type).toBe("tool_use")
    expect(blockStarts[0].content_block.name).toBe("get_weather")
    expect(blockStarts[0].content_block.id).toBe("call_1")
    expect(blockStops[0].index).toBe(0)

    // Second tool call
    expect(blockStarts[1].index).toBe(1)
    expect(blockStarts[1].content_block.type).toBe("tool_use")
    expect(blockStarts[1].content_block.name).toBe("get_time")
    expect(blockStarts[1].content_block.id).toBe("call_2")
    expect(blockStops[1].index).toBe(1)

    // Tool deltas use the correct index for their respective tool
    expect(allDeltas[0].index).toBe(0)
    expect(allDeltas[1].index).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// PR Fix #4: Anthropic emitter — thinking→text block transitions
// ─────────────────────────────────────────────────────────────────────────────

describe("PR Fix #4: Anthropic emitter — thinking→text block index transitions", () => {
  it("thinking occupies index=0, subsequent text block occupies index=1", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "msg_think", model: "claude-sonnet-4-20250514" },
      { type: "content_delta", delta: { thinking: "Let me think..." } },
      { type: "content_delta", delta: { thinking: " carefully." } },
      { type: "content_delta", delta: { text: "The answer is 42." } },
      { type: "message_end", stop_reason: "end_turn" },
    ]

    const output = await readStream(emitAnthropicStream(makeEvents(events)))
    const { dataLines } = parseSseOutput(output)

    const blockStarts = dataLines.filter((d: any) => d.type === "content_block_start")
    const thinkingDeltas = dataLines.filter((d: any) => d.delta?.type === "thinking_delta")
    const textDeltas = dataLines.filter((d: any) => d.delta?.type === "text_delta")

    // Exactly one thinking block and one text block
    expect(blockStarts).toHaveLength(2)
    expect(blockStarts[0].content_block.type).toBe("thinking")
    expect(blockStarts[0].index).toBe(0)
    expect(blockStarts[1].content_block.type).toBe("text")
    expect(blockStarts[1].index).toBe(1)

    // Two thinking deltas, both at index=0
    expect(thinkingDeltas).toHaveLength(2)
    expect(thinkingDeltas[0].index).toBe(0)
    expect(thinkingDeltas[1].index).toBe(0)

    // One text delta at index=1
    expect(textDeltas).toHaveLength(1)
    expect(textDeltas[0].index).toBe(1)
    expect(textDeltas[0].delta.text).toBe("The answer is 42.")
  })

  it("multiple consecutive thinking deltas stay in a single thinking block (no duplicate block_start)", async () => {
    const events: UniversalStreamEvent[] = [
      { type: "message_start", id: "msg_t2", model: "claude-sonnet-4-20250514" },
      { type: "content_delta", delta: { thinking: "Step 1..." } },
      { type: "content_delta", delta: { thinking: " Step 2..." } },
      { type: "content_delta", delta: { thinking: " Step 3." } },
      { type: "message_end", stop_reason: "end_turn" },
    ]

    const output = await readStream(emitAnthropicStream(makeEvents(events)))
    const { dataLines } = parseSseOutput(output)

    const thinkingStarts = dataLines.filter(
      (d: any) => d.type === "content_block_start" && d.content_block?.type === "thinking"
    )
    const thinkingDeltas = dataLines.filter((d: any) => d.delta?.type === "thinking_delta")

    // Must be exactly ONE thinking block start (not three)
    expect(thinkingStarts).toHaveLength(1)
    // But three deltas inside it
    expect(thinkingDeltas).toHaveLength(3)
    // All at index=0
    expect(thinkingDeltas.every((d: any) => d.index === 0)).toBe(true)
  })
})
