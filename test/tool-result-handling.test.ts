import { describe, expect, test } from "vitest"
import { toUniversal, fromUniversal } from "../src"

describe("Tool Result Handling", () => {
  test("Round-trip: OpenAI tool call and result", () => {
    const openaiRequest = {
      model: "gpt-4",
      messages: [
        { role: "user", content: "What's the weather?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"location":"Boston"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_123",
          name: "get_weather",
          content: '{"temperature":65,"condition":"rainy"}',
        },
      ],
    }

    // Convert to universal
    const universal = toUniversal("openai", openaiRequest)

    // Verify universal format
    expect(universal.messages[2].role).toBe("tool")
    expect(universal.messages[2].content[0].type).toBe("tool_result")
    expect(universal.messages[2].content[0].tool_result?.tool_call_id).toBe(
      "call_123",
    )

    // Convert back to OpenAI
    const backToOpenAI = fromUniversal("openai", universal)

    // Verify round-trip preserves structure
    expect(backToOpenAI.messages[2]).toMatchObject({
      role: "tool",
      tool_call_id: "call_123",
      name: "get_weather",
      content: '{"temperature":65,"condition":"rainy"}',
    })
  })
})
