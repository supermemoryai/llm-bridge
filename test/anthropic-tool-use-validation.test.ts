import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"
import type { AnthropicBody } from "../src/types/providers"

describe("Anthropic Tool Use Format Validation", () => {
  describe("Tool Definition Format", () => {
    it("should correctly parse tool definitions with input_schema", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "What's the weather?" }
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get current weather",
            input_schema: {
              type: "object",
              properties: {
                location: { type: "string", description: "City name" },
                unit: { type: "string", enum: ["celsius", "fahrenheit"] }
              },
              required: ["location"]
            }
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)

      expect(universal.tools).toBeDefined()
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get current weather")
      expect(universal.tools![0].parameters).toHaveProperty("properties")
      expect(universal.tools![0].metadata?.input_schema).toBeDefined()
    })
  })

  describe("Tool Use Block Format", () => {
    it("should parse tool_use blocks with correct structure", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "I'll check the weather for you."
              },
              {
                type: "tool_use",
                id: "toolu_01A09q90qw90lq917835lq9",
                name: "get_weather",
                input: { location: "San Francisco", unit: "celsius" }
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)

      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("assistant")
      expect(universal.messages[0].content).toHaveLength(2)

      const toolCallContent = universal.messages[0].content[1]
      expect(toolCallContent.type).toBe("tool_call")
      expect(toolCallContent.tool_call?.id).toBe("toolu_01A09q90qw90lq917835lq9")
      expect(toolCallContent.tool_call?.name).toBe("get_weather")
      expect(toolCallContent.tool_call?.arguments).toEqual({
        location: "San Francisco",
        unit: "celsius"
      })
      // Verify input is stored as object, not string
      expect(typeof toolCallContent.tool_call?.arguments).toBe("object")
    })

    it("should preserve tool_use ID format (toolu_*)", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_123abc",
                name: "test_tool",
                input: {}
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const toolCall = universal.messages[0].content[0]

      expect(toolCall.tool_call?.id).toBe("toolu_123abc")
      expect(toolCall.tool_call?.id).toMatch(/^toolu_/)
    })
  })

  describe("Tool Result Format", () => {
    it("should parse tool_result blocks in user messages", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01A09q90qw90lq917835lq9",
                content: "Temperature: 15°C, Sunny"
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)

      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")

      const toolResultContent = universal.messages[0].content[0]
      expect(toolResultContent.type).toBe("tool_result")
      expect(toolResultContent.tool_result?.tool_call_id).toBe("toolu_01A09q90qw90lq917835lq9")
      expect(toolResultContent.tool_result?.result).toBe("Temperature: 15°C, Sunny")
    })

    it("should map tool_use_id to tool_call_id", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_xyz789",
                content: "Result data"
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const toolResult = universal.messages[0].content[0]

      // Universal format uses tool_call_id
      expect(toolResult.tool_result?.tool_call_id).toBe("toolu_xyz789")
      // Metadata preserves original tool_use_id
      expect(toolResult.tool_result?.metadata?.tool_use_id).toBe("toolu_xyz789")
    })
  })

  describe("Complete Tool Use Flow", () => {
    it("should handle complete tool use conversation", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What's the weather in Tokyo?"
          },
          {
            role: "assistant",
            content: [
              {
                type: "text",
                text: "I'll check the weather for you."
              },
              {
                type: "tool_use",
                id: "toolu_tokyo_123",
                name: "get_weather",
                input: { location: "Tokyo", unit: "celsius" }
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_tokyo_123",
                content: "18°C, Cloudy, Humidity: 80%"
              }
            ]
          }
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather info",
            input_schema: {
              type: "object",
              properties: {
                location: { type: "string" },
                unit: { type: "string" }
              }
            }
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)

      // Verify message count
      expect(universal.messages).toHaveLength(3)

      // Verify first message (user query)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("What's the weather in Tokyo?")

      // Verify second message (assistant with tool use)
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[1].content).toHaveLength(2)
      const toolCall = universal.messages[1].content[1]
      expect(toolCall.type).toBe("tool_call")
      expect(toolCall.tool_call?.id).toBe("toolu_tokyo_123")

      // Verify third message (user with tool result)
      expect(universal.messages[2].role).toBe("user")
      const toolResult = universal.messages[2].content[0]
      expect(toolResult.type).toBe("tool_result")
      expect(toolResult.tool_result?.tool_call_id).toBe("toolu_tokyo_123")

      // Verify tools
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
    })
  })

  describe("Round-trip Conversion", () => {
    it("should preserve structure through round-trip conversion", () => {
      const original: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_roundtrip",
                name: "test_tool",
                input: { param1: "value1", param2: 42 }
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_roundtrip",
                content: "Success"
              }
            ]
          }
        ],
        tools: [
          {
            name: "test_tool",
            description: "Test",
            input_schema: {
              type: "object",
              properties: { param1: { type: "string" }, param2: { type: "number" } }
            }
          }
        ]
      }

      const universal = toUniversal("anthropic", original)
      const reconstructed = fromUniversal("anthropic", universal) as AnthropicBody

      // Verify tools preserved
      expect(reconstructed.tools).toHaveLength(1)
      expect(reconstructed.tools![0].name).toBe("test_tool")

      // Verify messages preserved
      expect(reconstructed.messages).toHaveLength(2)

      // Verify tool use preserved
      const toolUseMsg = reconstructed.messages[0]
      expect(toolUseMsg.role).toBe("assistant")
      expect(Array.isArray(toolUseMsg.content)).toBe(true)
      const toolUseBlock = (toolUseMsg.content as any[])[0]
      expect(toolUseBlock.type).toBe("tool_use")
      expect(toolUseBlock.id).toBe("toolu_roundtrip")
      expect(toolUseBlock.input).toEqual({ param1: "value1", param2: 42 })

      // Verify tool result preserved
      const toolResultMsg = reconstructed.messages[1]
      expect(toolResultMsg.role).toBe("user")
      const toolResultBlock = (toolResultMsg.content as any[])[0]
      expect(toolResultBlock.type).toBe("tool_result")
      expect(toolResultBlock.tool_use_id).toBe("toolu_roundtrip")
      expect(toolResultBlock.content).toBe("Success")
    })
  })

  describe("Edge Cases", () => {
    it("should handle multiple tool uses in single message", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_1",
                name: "tool_a",
                input: { x: 1 }
              },
              {
                type: "tool_use",
                id: "toolu_2",
                name: "tool_b",
                input: { y: 2 }
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const content = universal.messages[0].content

      expect(content).toHaveLength(2)
      expect(content[0].type).toBe("tool_call")
      expect(content[0].tool_call?.id).toBe("toolu_1")
      expect(content[1].type).toBe("tool_call")
      expect(content[1].tool_call?.id).toBe("toolu_2")
    })

    it("should handle multiple tool results in single message", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_1",
                content: "Result 1"
              },
              {
                type: "tool_result",
                tool_use_id: "toolu_2",
                content: "Result 2"
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const content = universal.messages[0].content

      expect(content).toHaveLength(2)
      expect(content[0].type).toBe("tool_result")
      expect(content[0].tool_result?.tool_call_id).toBe("toolu_1")
      expect(content[1].type).toBe("tool_result")
      expect(content[1].tool_result?.tool_call_id).toBe("toolu_2")
    })

    it("should handle tool result with JSON content", () => {
      const jsonResult = { temperature: 72, condition: "sunny", humidity: 65 }
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_json",
                content: JSON.stringify(jsonResult)
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const toolResult = universal.messages[0].content[0]

      expect(toolResult.type).toBe("tool_result")
      expect(toolResult.tool_result?.result).toBe(JSON.stringify(jsonResult))
    })

    it("should handle empty tool input", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_empty",
                name: "no_params_tool",
                input: {}
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const toolCall = universal.messages[0].content[0]

      expect(toolCall.tool_call?.arguments).toEqual({})
    })
  })

  describe("Type Safety", () => {
    it("should verify input is object type, not string", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_type_check",
                name: "test_tool",
                input: { key: "value", number: 123 }
              }
            ]
          }
        ]
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const toolCall = universal.messages[0].content[0]

      // Verify it's an object, not a string
      expect(typeof toolCall.tool_call?.arguments).toBe("object")
      expect(typeof toolCall.tool_call?.arguments).not.toBe("string")
      expect(toolCall.tool_call?.arguments).toEqual({ key: "value", number: 123 })
    })
  })
})
