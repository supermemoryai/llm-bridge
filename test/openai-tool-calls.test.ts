import { describe, it, expect } from "vitest"
import {
  extractToolCallsFromResponse,
  buildContinuationHeaders,
  buildContinuationRequest,
  NormalizedToolCall,
} from "../src/tools"
import { toUniversal } from "../src/models"

describe("OpenAI Tool Calls", () => {
  describe("extractToolCallsFromResponse", () => {
    it("should extract single tool call from OpenAI response", () => {
      const response = {
        id: "chatcmpl-123",
        object: "chat.completion",
        created: 1677652288,
        model: "gpt-4",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_abc123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"San Francisco","unit":"celsius"}',
                  },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].id).toBe("call_abc123")
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[0].input).toEqual({
        location: "San Francisco",
        unit: "celsius",
      })
    })

    it("should extract multiple tool calls from OpenAI response", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"NYC"}',
                  },
                },
                {
                  id: "call_2",
                  type: "function",
                  function: {
                    name: "get_time",
                    arguments: '{"timezone":"EST"}',
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(2)
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[1].name).toBe("get_time")
    })

    it("should handle empty tool calls array", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "I don't need any tools",
              tool_calls: [],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should handle response without tool_calls property", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              content: "Just a regular response",
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should handle malformed JSON in arguments", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_malformed",
                  type: "function",
                  function: {
                    name: "test_tool",
                    arguments: "{invalid json}",
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({}) // Falls back to empty object
    })

    it("should handle empty arguments string", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_empty",
                  type: "function",
                  function: {
                    name: "no_args_tool",
                    arguments: "",
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({})
    })

    it("should preserve tool call ID format", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_xyz789",
                  type: "function",
                  function: {
                    name: "test",
                    arguments: "{}",
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "openai")

      expect(result.allTools[0].id).toBe("call_xyz789")
      expect(result.allTools[0].id).toMatch(/^call_/)
    })
  })

  describe("buildContinuationHeaders", () => {
    it("should build headers with Authorization for OpenAI", () => {
      const headers = {
        authorization: "Bearer sk-test123",
        "content-type": "application/json",
        host: "api.openai.com",
        "content-length": "1234",
      }

      const result = buildContinuationHeaders("openai", headers)

      expect(result["Content-Type"]).toBe("application/json")
      expect(result.Accept).toBe("application/json")
      expect(result.Authorization).toBe("Bearer sk-test123")
      expect(result.host).toBeUndefined()
      expect(result["content-length"]).toBeUndefined()
    })

    it("should handle case-insensitive Authorization header", () => {
      const headers = {
        Authorization: "Bearer sk-test456",
      }

      const result = buildContinuationHeaders("openai", headers)

      expect(result.Authorization).toBe("Bearer sk-test456")
    })

    it("should include OpenAI-Organization header if present", () => {
      const headers = {
        authorization: "Bearer sk-test",
        "OpenAI-Organization": "org-123",
      }

      const result = buildContinuationHeaders("openai", headers)

      expect(result.Authorization).toBe("Bearer sk-test")
      expect(result["OpenAI-Organization"]).toBe("org-123")
    })

    it("should handle lowercase openai-organization header", () => {
      const headers = {
        authorization: "Bearer sk-test",
        "openai-organization": "org-456",
      }

      const result = buildContinuationHeaders("openai", headers)

      expect(result["OpenAI-Organization"]).toBe("org-456")
    })

    it("should not include auth headers if not present", () => {
      const headers = {
        "content-type": "application/json",
      }

      const result = buildContinuationHeaders("openai", headers)

      expect(result.Authorization).toBeUndefined()
      expect(result["OpenAI-Organization"]).toBeUndefined()
    })
  })

  describe("buildContinuationRequest", () => {
    it("should build continuation request with tool call and result", async () => {
      const originalBody = {
        model: "gpt-4",
        messages: [
          { role: "user", content: "What's the weather in Boston?" },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_123",
        name: "get_weather",
        input: { location: "Boston", unit: "fahrenheit" },
      }

      const toolResult = {
        temperature: 72,
        condition: "sunny",
      }

      const responseJson = {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: {
                    name: "get_weather",
                    arguments: '{"location":"Boston","unit":"fahrenheit"}',
                  },
                },
              ],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        toolResult,
        responseJson
      )

      expect(result.model).toBe("gpt-4")
      expect(result.messages).toHaveLength(3)

      // First message: original user message
      expect(result.messages[0].role).toBe("user")
      expect(result.messages[0].content).toBe("What's the weather in Boston?")

      // Second message: assistant with tool call
      expect(result.messages[1].role).toBe("assistant")
      expect(result.messages[1].content).toBe(null)
      expect(result.messages[1].tool_calls).toHaveLength(1)
      expect(result.messages[1].tool_calls[0].id).toBe("call_123")
      expect(result.messages[1].tool_calls[0].function.name).toBe("get_weather")

      // Third message: tool result
      expect(result.messages[2].role).toBe("tool")
      expect(result.messages[2].tool_call_id).toBe("call_123")
      expect(JSON.parse(result.messages[2].content)).toEqual({
        temperature: 72,
        condition: "sunny",
      })
    })

    it("should preserve model parameter in continuation request", async () => {
      const originalBody = {
        model: "gpt-4-turbo-preview",
        messages: [{ role: "user", content: "Test" }],
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_test",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        choices: [{ message: { role: "assistant", tool_calls: [] } }],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.model).toBe("gpt-4-turbo-preview")
    })

    it("should preserve temperature and other parameters", async () => {
      const originalBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Test" }],
        temperature: 0.9,
        top_p: 0.95,
        frequency_penalty: 0.5,
        presence_penalty: 0.3,
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_test",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        choices: [{ message: { role: "assistant", tool_calls: [] } }],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.temperature).toBe(0.9)
      expect(result.top_p).toBe(0.95)
      expect(result.frequency_penalty).toBe(0.5)
      expect(result.presence_penalty).toBe(0.3)
    })

    it("should handle max_tokens to max_completion_tokens conversion", async () => {
      const originalBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Test" }],
        max_tokens: 500,
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_test",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        choices: [{ message: { role: "assistant", tool_calls: [] } }],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      // New OpenAI models use max_completion_tokens instead of max_tokens
      expect(result.max_completion_tokens).toBe(500)
      expect(result.max_tokens).toBeUndefined()
    })

    it("should remove undefined values from continuation request", async () => {
      const originalBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Test" }],
        temperature: undefined,
        top_p: undefined,
        max_tokens: 100,
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_test",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        choices: [{ message: { role: "assistant", tool_calls: [] } }],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.temperature).toBeUndefined()
      expect(result.top_p).toBeUndefined()
      expect("temperature" in result).toBe(false)
      expect("top_p" in result).toBe(false)
    })

    it("should not include tools parameter in continuation", async () => {
      const originalBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Test" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test_tool",
              description: "A test tool",
              parameters: { type: "object" },
            },
          },
        ],
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "call_test",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        choices: [{ message: { role: "assistant", tool_calls: [] } }],
      }

      const result = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.tools).toBeUndefined()
    })
  })

  describe("Complete Tool Call Flow", () => {
    it("should handle complete flow: extraction → continuation → result", async () => {
      // Step 1: Extract tool call from response
      const llmResponse = {
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call_weather_123",
                  type: "function",
                  function: {
                    name: "get_current_weather",
                    arguments: '{"location":"Paris","unit":"celsius"}',
                  },
                },
              ],
            },
          },
        ],
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "openai")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools[0].name).toBe("get_current_weather")

      // Step 2: Build continuation request with tool result
      const originalBody = {
        model: "gpt-4",
        messages: [
          { role: "user", content: "What's the weather in Paris?" },
        ],
        temperature: 0.7,
      }

      const originalUniversal = toUniversal("openai", originalBody)

      const toolResult = {
        temperature: 18,
        condition: "partly cloudy",
        humidity: 65,
      }

      const continuationRequest = await buildContinuationRequest(
        "openai",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        toolResult,
        llmResponse
      )

      // Verify continuation request structure
      expect(continuationRequest.messages).toHaveLength(3)
      expect(continuationRequest.messages[1].role).toBe("assistant")
      expect(continuationRequest.messages[1].tool_calls[0].id).toBe(
        "call_weather_123"
      )
      expect(continuationRequest.messages[2].role).toBe("tool")
      expect(continuationRequest.messages[2].tool_call_id).toBe(
        "call_weather_123"
      )

      // Verify tool result is properly formatted
      const resultContent = JSON.parse(continuationRequest.messages[2].content)
      expect(resultContent.temperature).toBe(18)
      expect(resultContent.condition).toBe("partly cloudy")
    })
  })
})
