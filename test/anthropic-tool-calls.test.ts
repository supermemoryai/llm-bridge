import { describe, it, expect } from "vitest"
import {
  extractToolCallsFromResponse,
  buildContinuationHeaders,
  buildContinuationRequest,
  NormalizedToolCall,
} from "../src/tools"
import { toUniversal } from "../src/models"

describe("Anthropic Tool Calls", () => {
  describe("extractToolCallsFromResponse", () => {
    it("should extract single tool call from Anthropic response", () => {
      const response = {
        id: "msg_01XFDUDYJgAACzvnptvVoYEL",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: "I'll help you check the weather.",
          },
          {
            type: "tool_use",
            id: "toolu_01T1x1fJ34qAmk2tNTrN7Up6",
            name: "get_weather",
            input: {
              location: "San Francisco",
              unit: "celsius",
            },
          },
        ],
        stop_reason: "tool_use",
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].id).toBe("toolu_01T1x1fJ34qAmk2tNTrN7Up6")
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[0].input).toEqual({
        location: "San Francisco",
        unit: "celsius",
      })
    })

    it("should extract multiple tool calls from Anthropic response", () => {
      const response = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { location: "NYC" },
          },
          {
            type: "tool_use",
            id: "toolu_02",
            name: "get_time",
            input: { timezone: "America/New_York" },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(2)
      expect(result.allTools[0].id).toBe("toolu_01")
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[1].id).toBe("toolu_02")
      expect(result.allTools[1].name).toBe("get_time")
    })

    it("should handle response with only text content", () => {
      const response = {
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text: "I don't need any tools for this.",
          },
        ],
        stop_reason: "end_turn",
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should filter out non-tool_use content blocks", () => {
      const response = {
        content: [
          {
            type: "text",
            text: "Let me help you with that.",
          },
          {
            type: "tool_use",
            id: "toolu_123",
            name: "calculator",
            input: { expression: "2+2" },
          },
          {
            type: "text",
            text: "I'll calculate that for you.",
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].name).toBe("calculator")
    })

    it("should handle empty content array", () => {
      const response = {
        content: [],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should preserve tool_use ID format (toolu_*)", () => {
      const response = {
        content: [
          {
            type: "tool_use",
            id: "toolu_abc123def456",
            name: "test_tool",
            input: {},
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.allTools[0].id).toBe("toolu_abc123def456")
      expect(result.allTools[0].id).toMatch(/^toolu_/)
    })

    it("should handle tool_use with complex nested input", () => {
      const response = {
        content: [
          {
            type: "tool_use",
            id: "toolu_complex",
            name: "complex_tool",
            input: {
              user: {
                name: "John",
                preferences: {
                  theme: "dark",
                  notifications: true,
                },
              },
              items: ["item1", "item2", "item3"],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({
        user: {
          name: "John",
          preferences: {
            theme: "dark",
            notifications: true,
          },
        },
        items: ["item1", "item2", "item3"],
      })
    })

    it("should handle empty input object", () => {
      const response = {
        content: [
          {
            type: "tool_use",
            id: "toolu_empty",
            name: "no_params_tool",
            input: {},
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({})
    })
  })

  describe("buildContinuationHeaders", () => {
    it("should build headers with x-api-key for Anthropic", () => {
      const headers = {
        "x-api-key": "sk-ant-test123",
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        host: "api.anthropic.com",
        "content-length": "1234",
      }

      const result = buildContinuationHeaders("anthropic", headers)

      expect(result["Content-Type"]).toBe("application/json")
      expect(result.Accept).toBe("application/json")
      expect(result["x-api-key"]).toBe("sk-ant-test123")
      expect(result["anthropic-version"]).toBe("2023-06-01")
      expect(result.host).toBeUndefined()
      expect(result["content-length"]).toBeUndefined()
    })

    it("should handle missing anthropic-version header", () => {
      const headers = {
        "x-api-key": "sk-ant-test456",
      }

      const result = buildContinuationHeaders("anthropic", headers)

      expect(result["x-api-key"]).toBe("sk-ant-test456")
      expect(result["anthropic-version"]).toBeUndefined()
    })

    it("should not include headers if not present", () => {
      const headers = {
        "content-type": "application/json",
      }

      const result = buildContinuationHeaders("anthropic", headers)

      expect(result["x-api-key"]).toBeUndefined()
      expect(result["anthropic-version"]).toBeUndefined()
    })
  })

  describe("buildContinuationRequest", () => {
    it("should build continuation request with tool call and result", async () => {
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What's the weather in Tokyo?",
          },
        ],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "toolu_tokyo_123",
        name: "get_weather",
        input: { location: "Tokyo", unit: "celsius" },
      }

      const toolResult = {
        temperature: 18,
        condition: "cloudy",
        humidity: 80,
      }

      const responseJson = {
        content: [
          {
            type: "text",
            text: "I'll check the weather for you.",
          },
          {
            type: "tool_use",
            id: "toolu_tokyo_123",
            name: "get_weather",
            input: { location: "Tokyo", unit: "celsius" },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        toolCall,
        toolResult,
        responseJson
      )

      expect(result.model).toBe("claude-sonnet-4-5")
      expect(result.max_tokens).toBe(1024)
      expect(result.messages).toHaveLength(3)

      // First message: original user message
      expect(result.messages[0].role).toBe("user")
      expect(result.messages[0].content).toEqual([
        { type: "text", text: "What's the weather in Tokyo?" },
      ])

      // Second message: assistant with tool_use
      expect(result.messages[1].role).toBe("assistant")
      expect(result.messages[1].content).toHaveLength(1)
      expect(result.messages[1].content[0].type).toBe("tool_use")
      expect(result.messages[1].content[0].id).toBe("toolu_tokyo_123")
      expect(result.messages[1].content[0].name).toBe("get_weather")

      // Third message: user with tool_result
      expect(result.messages[2].role).toBe("user")
      expect(result.messages[2].content).toHaveLength(1)
      expect(result.messages[2].content[0].type).toBe("tool_result")
      expect(result.messages[2].content[0].tool_use_id).toBe("toolu_tokyo_123")
      // Anthropic requires JSON.stringify for tool results
      expect(result.messages[2].content[0].content).toBe(
        JSON.stringify(toolResult)
      )
    })

    it("should preserve tools in continuation request", async () => {
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Test" }],
        tools: [
          {
            name: "get_weather",
            description: "Get current weather",
            input_schema: {
              type: "object",
              properties: {
                location: { type: "string" },
              },
            },
          },
        ],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "toolu_test",
        name: "get_weather",
        input: { location: "Paris" },
      }

      const responseJson = {
        content: [
          {
            type: "tool_use",
            id: "toolu_test",
            name: "get_weather",
            input: { location: "Paris" },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        toolCall,
        { temp: 20 },
        responseJson
      )

      // Anthropic requires tools to be present in continuation requests
      expect(result.tools).toBeDefined()
      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].name).toBe("get_weather")
    })

    it("should handle multiple tool_use blocks in response", async () => {
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Test multiple tools" }],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "toolu_01",
        name: "tool_a",
        input: { param: "value1" },
      }

      const responseJson = {
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "tool_a",
            input: { param: "value1" },
          },
          {
            type: "tool_use",
            id: "toolu_02",
            name: "tool_b",
            input: { param: "value2" },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        toolCall,
        { result: "success" },
        responseJson
      )

      // Should include all tool_use blocks in assistant message
      expect(result.messages[1].content).toHaveLength(2)
      expect(result.messages[1].content[0].type).toBe("tool_use")
      expect(result.messages[1].content[1].type).toBe("tool_use")
    })

    it("should stringify tool result for Anthropic", async () => {
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Test" }],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "toolu_stringify",
        name: "test_tool",
        input: {},
      }

      const toolResult = {
        status: "success",
        data: {
          items: [1, 2, 3],
          total: 3,
        },
      }

      const responseJson = {
        content: [
          {
            type: "tool_use",
            id: "toolu_stringify",
            name: "test_tool",
            input: {},
          },
        ],
      }

      const result = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        toolCall,
        toolResult,
        responseJson
      )

      const toolResultMessage = result.messages[2]
      expect(toolResultMessage.content[0].content).toBe(
        JSON.stringify(toolResult)
      )
      expect(typeof toolResultMessage.content[0].content).toBe("string")
    })

    it("should preserve temperature and other parameters", async () => {
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        messages: [{ role: "user", content: "Test" }],
        temperature: 0.8,
        top_p: 0.9,
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "toolu_params",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        content: [
          {
            type: "tool_use",
            id: "toolu_params",
            name: "test_tool",
            input: {},
          },
        ],
      }

      const result = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.temperature).toBe(0.8)
      expect(result.top_p).toBe(0.9)
      expect(result.max_tokens).toBe(2048)
    })
  })

  describe("Complete Tool Call Flow", () => {
    it("should handle complete Anthropic tool use flow", async () => {
      // Step 1: Extract tool call from Anthropic response
      const llmResponse = {
        id: "msg_01ABC123",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-5",
        content: [
          {
            type: "text",
            text: "I'll calculate that for you.",
          },
          {
            type: "tool_use",
            id: "toolu_calculator_789",
            name: "calculator",
            input: {
              operation: "multiply",
              a: 42,
              b: 17,
            },
          },
        ],
        stop_reason: "tool_use",
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "anthropic")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools[0].name).toBe("calculator")
      expect(extraction.allTools[0].input.operation).toBe("multiply")

      // Step 2: Build continuation request with tool result
      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: "What is 42 multiplied by 17?",
          },
        ],
        tools: [
          {
            name: "calculator",
            description: "Perform mathematical calculations",
            input_schema: {
              type: "object",
              properties: {
                operation: { type: "string" },
                a: { type: "number" },
                b: { type: "number" },
              },
            },
          },
        ],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const toolResult = {
        result: 714,
      }

      const continuationRequest = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        toolResult,
        llmResponse
      )

      // Verify continuation request structure
      expect(continuationRequest.messages).toHaveLength(3)
      expect(continuationRequest.messages[1].role).toBe("assistant")
      expect(continuationRequest.messages[1].content[0].type).toBe("tool_use")
      expect(continuationRequest.messages[1].content[0].id).toBe(
        "toolu_calculator_789"
      )

      expect(continuationRequest.messages[2].role).toBe("user")
      expect(continuationRequest.messages[2].content[0].type).toBe(
        "tool_result"
      )
      expect(continuationRequest.messages[2].content[0].tool_use_id).toBe(
        "toolu_calculator_789"
      )

      // Verify tool result is stringified
      const resultContent = continuationRequest.messages[2].content[0].content
      expect(typeof resultContent).toBe("string")
      expect(JSON.parse(resultContent)).toEqual({ result: 714 })

      // Verify tools are preserved
      expect(continuationRequest.tools).toBeDefined()
      expect(continuationRequest.tools[0].name).toBe("calculator")
    })

    it("should handle tool use with text before and after", async () => {
      const llmResponse = {
        content: [
          {
            type: "text",
            text: "Let me search for that information.",
          },
          {
            type: "tool_use",
            id: "toolu_search_456",
            name: "web_search",
            input: { query: "Claude AI capabilities" },
          },
          {
            type: "text",
            text: "I'll analyze the results.",
          },
        ],
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "anthropic")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools).toHaveLength(1)

      const originalBody = {
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Tell me about Claude AI" }],
      }

      const originalUniversal = toUniversal("anthropic", originalBody)

      const continuationRequest = await buildContinuationRequest(
        "anthropic",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        { results: ["Result 1", "Result 2"] },
        llmResponse
      )

      // Assistant message should only contain tool_use blocks (filtered)
      expect(continuationRequest.messages[1].role).toBe("assistant")
      expect(continuationRequest.messages[1].content).toHaveLength(1)
      expect(continuationRequest.messages[1].content[0].type).toBe("tool_use")
    })
  })
})
