import { describe, it, expect } from "vitest"
import {
  extractToolCallsFromResponse,
  buildContinuationHeaders,
  buildContinuationRequest,
  NormalizedToolCall,
} from "../src/tools"
import { toUniversal } from "../src/models"

describe("Google Tool Calls", () => {
  describe("extractToolCallsFromResponse", () => {
    it("should extract single tool call from Google response", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Let me check the weather for you.",
                },
                {
                  functionCall: {
                    name: "get_weather",
                    args: {
                      location: "San Francisco",
                      unit: "fahrenheit",
                    },
                  },
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
            index: 0,
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[0].input).toEqual({
        location: "San Francisco",
        unit: "fahrenheit",
      })
      // Google generates IDs automatically
      expect(result.allTools[0].id).toMatch(/^gemini_tool_/)
    })

    it("should extract multiple tool calls from Google response", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "NYC" },
                  },
                },
                {
                  functionCall: {
                    name: "get_time",
                    args: { timezone: "America/New_York" },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(2)
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[1].name).toBe("get_time")
    })

    it("should handle response with only text parts", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "I can answer that directly without tools.",
                },
              ],
              role: "model",
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should filter out non-functionCall parts", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "Let me calculate that.",
                },
                {
                  functionCall: {
                    name: "calculator",
                    args: { expression: "5*7" },
                  },
                },
                {
                  text: "I'll use the calculator for this.",
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].name).toBe("calculator")
    })

    it("should generate unique IDs for each tool call", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "tool_a",
                    args: {},
                  },
                },
                {
                  functionCall: {
                    name: "tool_b",
                    args: {},
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.allTools).toHaveLength(2)
      expect(result.allTools[0].id).toMatch(/^gemini_tool_/)
      expect(result.allTools[1].id).toMatch(/^gemini_tool_/)
      // IDs should be different
      expect(result.allTools[0].id).not.toBe(result.allTools[1].id)
    })

    it("should handle empty candidates array", () => {
      const response = {
        candidates: [],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should handle missing content.parts", () => {
      const response = {
        candidates: [
          {
            content: {
              role: "model",
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(false)
      expect(result.allTools).toHaveLength(0)
    })

    it("should handle functionCall with empty args", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "no_args_function",
                    args: {},
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({})
    })

    it("should handle functionCall with complex nested args", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "complex_function",
                    args: {
                      user: {
                        id: 123,
                        profile: {
                          name: "Alice",
                          settings: { theme: "dark" },
                        },
                      },
                      items: [1, 2, 3],
                    },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")

      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools[0].input).toEqual({
        user: {
          id: 123,
          profile: {
            name: "Alice",
            settings: { theme: "dark" },
          },
        },
        items: [1, 2, 3],
      })
    })
  })

  describe("buildContinuationHeaders", () => {
    it("should build headers with x-goog-api-key for Google", () => {
      const headers = {
        "x-goog-api-key": "AIza-test-key-123",
        "content-type": "application/json",
        host: "generativelanguage.googleapis.com",
        "content-length": "1234",
      }

      const result = buildContinuationHeaders("google", headers)

      expect(result["Content-Type"]).toBe("application/json")
      expect(result.Accept).toBe("application/json")
      expect(result["x-goog-api-key"]).toBe("AIza-test-key-123")
      expect(result.host).toBeUndefined()
      expect(result["content-length"]).toBeUndefined()
    })

    it("should handle Authorization header for Google", () => {
      const headers = {
        authorization: "Bearer ya29.test-oauth-token",
      }

      const result = buildContinuationHeaders("google", headers)

      expect(result.Authorization).toBe("Bearer ya29.test-oauth-token")
    })

    it("should handle case-insensitive Authorization header", () => {
      const headers = {
        Authorization: "Bearer ya29.test-token",
      }

      const result = buildContinuationHeaders("google", headers)

      expect(result.Authorization).toBe("Bearer ya29.test-token")
    })

    it("should include both x-goog-api-key and Authorization if present", () => {
      const headers = {
        "x-goog-api-key": "AIza-key",
        authorization: "Bearer token",
      }

      const result = buildContinuationHeaders("google", headers)

      expect(result["x-goog-api-key"]).toBe("AIza-key")
      expect(result.Authorization).toBe("Bearer token")
    })

    it("should not include auth headers if not present", () => {
      const headers = {
        "content-type": "application/json",
      }

      const result = buildContinuationHeaders("google", headers)

      expect(result["x-goog-api-key"]).toBeUndefined()
      expect(result.Authorization).toBeUndefined()
    })
  })

  describe("buildContinuationRequest", () => {
    it("should build continuation request with tool call and result", async () => {
      const originalBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What's the weather in London?" }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "gemini_tool_123456",
        name: "get_weather",
        input: { location: "London", unit: "celsius" },
      }

      const toolResult = {
        temperature: 12,
        condition: "rainy",
        humidity: 85,
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "London", unit: "celsius" },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        toolResult,
        responseJson
      )

      expect(result.contents).toBeDefined()
      expect(result.contents).toHaveLength(3)

      // First message: original user message
      expect(result.contents[0].role).toBe("user")
      expect(result.contents[0].parts[0].text).toBe(
        "What's the weather in London?"
      )

      // Second message: model with functionCall
      expect(result.contents[1].role).toBe("model")
      expect(result.contents[1].parts).toHaveLength(1)
      expect(result.contents[1].parts[0].functionCall).toBeDefined()
      expect(result.contents[1].parts[0].functionCall.name).toBe("get_weather")

      // Third message: user with functionResponse
      expect(result.contents[2].role).toBe("user")
      expect(result.contents[2].parts).toHaveLength(1)
      expect(result.contents[2].parts[0].functionResponse).toBeDefined()
      expect(result.contents[2].parts[0].functionResponse.name).toBe(
        "get_weather"
      )
      // Google expects tool result as plain object, not stringified
      expect(result.contents[2].parts[0].functionResponse.response).toEqual(
        toolResult
      )
    })

    it("should not stringify tool result for Google (unlike Anthropic)", async () => {
      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Test" }] }],
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "gemini_tool_test",
        name: "test_tool",
        input: {},
      }

      const toolResult = {
        status: "success",
        data: { count: 42 },
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "test_tool",
                    args: {},
                  },
                },
              ],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        toolResult,
        responseJson
      )

      const functionResponse =
        result.contents[2].parts[0].functionResponse.response
      // Should be an object, not a string
      expect(typeof functionResponse).toBe("object")
      expect(functionResponse).toEqual(toolResult)
    })

    it("should preserve generationConfig parameters", async () => {
      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Test" }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
        },
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "gemini_tool_params",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "test_tool", args: {} } }],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.generationConfig).toBeDefined()
      expect(result.generationConfig.temperature).toBe(0.9)
      expect(result.generationConfig.topP).toBe(0.95)
      expect(result.generationConfig.topK).toBe(40)
      expect(result.generationConfig.maxOutputTokens).toBe(2048)
    })

    it("should preserve tools in continuation request", async () => {
      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Test" }] }],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get current weather",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string" },
                  },
                },
              },
            ],
          },
        ],
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "gemini_tool_preserve",
        name: "get_weather",
        input: { location: "Paris" },
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "Paris" },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        { temp: 20 },
        responseJson
      )

      expect(result.tools).toBeDefined()
      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].functionDeclarations[0].name).toBe("get_weather")
    })

    it("should preserve systemInstruction in continuation", async () => {
      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Test" }] }],
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant" }],
        },
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolCall: NormalizedToolCall = {
        id: "gemini_tool_sys",
        name: "test_tool",
        input: {},
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "test_tool", args: {} } }],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        {},
        responseJson
      )

      expect(result.systemInstruction).toBeDefined()
      expect(result.systemInstruction.parts[0].text).toBe(
        "You are a helpful assistant"
      )
    })

    it("should handle tool call with generated gemini_tool_* ID", async () => {
      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Calculate 7*8" }] }],
      }

      const originalUniversal = toUniversal("google", originalBody)

      // Google generates IDs like this
      const toolCall: NormalizedToolCall = {
        id: `gemini_tool_${Date.now()}_${Math.random()}`,
        name: "calculator",
        input: { expression: "7*8" },
      }

      const responseJson = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "calculator",
                    args: { expression: "7*8" },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        toolCall,
        { result: 56 },
        responseJson
      )

      expect(result.contents).toHaveLength(3)
      expect(result.contents[1].parts[0].functionCall.name).toBe("calculator")
      expect(result.contents[2].parts[0].functionResponse.name).toBe(
        "calculator"
      )
    })
  })

  describe("Complete Tool Call Flow", () => {
    it("should handle complete Google tool call flow", async () => {
      // Step 1: Extract tool call from Google response
      const llmResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "I'll search for that information.",
                },
                {
                  functionCall: {
                    name: "web_search",
                    args: {
                      query: "Gemini AI capabilities 2024",
                      max_results: 5,
                    },
                  },
                },
              ],
              role: "model",
            },
            finishReason: "STOP",
          },
        ],
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "google")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools[0].name).toBe("web_search")
      expect(extraction.allTools[0].input.query).toBe(
        "Gemini AI capabilities 2024"
      )

      // Step 2: Build continuation request with tool result
      const originalBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Tell me about Gemini AI" }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "web_search",
                description: "Search the web",
                parameters: {
                  type: "object",
                  properties: {
                    query: { type: "string" },
                    max_results: { type: "number" },
                  },
                },
              },
            ],
          },
        ],
      }

      const originalUniversal = toUniversal("google", originalBody)

      const toolResult = {
        results: [
          { title: "Gemini Overview", snippet: "AI model by Google" },
          { title: "Gemini Features", snippet: "Multimodal capabilities" },
        ],
      }

      const continuationRequest = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        toolResult,
        llmResponse
      )

      // Verify continuation request structure
      expect(continuationRequest.contents).toHaveLength(3)

      // Original user message
      expect(continuationRequest.contents[0].role).toBe("user")
      expect(continuationRequest.contents[0].parts[0].text).toBe(
        "Tell me about Gemini AI"
      )

      // Model with functionCall
      expect(continuationRequest.contents[1].role).toBe("model")
      expect(continuationRequest.contents[1].parts[0].functionCall).toBeDefined()
      expect(continuationRequest.contents[1].parts[0].functionCall.name).toBe(
        "web_search"
      )

      // User with functionResponse
      expect(continuationRequest.contents[2].role).toBe("user")
      expect(
        continuationRequest.contents[2].parts[0].functionResponse
      ).toBeDefined()
      expect(
        continuationRequest.contents[2].parts[0].functionResponse.name
      ).toBe("web_search")
      expect(
        continuationRequest.contents[2].parts[0].functionResponse.response
      ).toEqual(toolResult)

      // Verify other properties preserved
      expect(continuationRequest.generationConfig.temperature).toBe(0.7)
      expect(continuationRequest.tools).toHaveLength(1)
    })

    it("should handle multiple function calls in sequence", async () => {
      const llmResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_location",
                    args: { ip: "1.2.3.4" },
                  },
                },
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "auto" },
                  },
                },
              ],
            },
          },
        ],
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "google")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools).toHaveLength(2)

      const originalBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What's my local weather?" }],
          },
        ],
      }

      const originalUniversal = toUniversal("google", originalBody)

      // Test continuation with first tool result
      const continuationRequest = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        { city: "San Francisco", country: "US" },
        llmResponse
      )

      expect(continuationRequest.contents).toHaveLength(3)
      // Model message should contain both functionCalls
      expect(continuationRequest.contents[1].parts).toHaveLength(1)
      expect(continuationRequest.contents[1].parts[0].functionCall.name).toBe(
        "get_location"
      )
    })

    it("should handle empty tool result", async () => {
      const llmResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "ping",
                    args: {},
                  },
                },
              ],
            },
          },
        ],
      }

      const extraction = extractToolCallsFromResponse(llmResponse, "google")

      const originalBody = {
        contents: [{ role: "user", parts: [{ text: "Test" }] }],
      }

      const originalUniversal = toUniversal("google", originalBody)

      const continuationRequest = await buildContinuationRequest(
        "google",
        originalBody,
        originalUniversal,
        extraction.allTools[0],
        {}, // Empty result
        llmResponse
      )

      expect(
        continuationRequest.contents[2].parts[0].functionResponse.response
      ).toEqual({})
    })
  })
})
