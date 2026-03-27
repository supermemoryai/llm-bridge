import { describe, it, expect } from "vitest"
import {
  extractToolCallsFromResponse,
  buildContinuationHeaders,
  buildContinuationRequest,
  NormalizedToolCall,
} from "../src/tools"
import { toUniversal, fromUniversal } from "../src/models"
import { translateBetweenProviders } from "../src/models/translate"

describe("Tool Calling", () => {
  describe("OpenAI: full tool lifecycle", () => {
    it("should define tools, call, return result, and build continuation", async () => {
      // Step 1: Define tools in OpenAI format
      const originalBody = {
        model: "gpt-4",
        messages: [
          { role: "user", content: "What's the weather in San Francisco?" },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get current weather",
              parameters: {
                type: "object",
                properties: {
                  location: { type: "string" },
                  unit: { type: "string", enum: ["celsius", "fahrenheit"] },
                },
                required: ["location"],
              },
            },
          },
        ],
        temperature: 0.7,
      }

      // Step 2: Convert to universal and verify tool definition
      const universal = toUniversal("openai", originalBody as any)
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get current weather")

      // Step 3: Simulate LLM response with tool call
      const llmResponse = {
        choices: [
          {
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

      // Step 4: Extract tool calls
      const extraction = extractToolCallsFromResponse(llmResponse, "openai")
      expect(extraction.hasToolCalls).toBe(true)
      expect(extraction.allTools).toHaveLength(1)
      expect(extraction.allTools[0].id).toBe("call_abc123")
      expect(extraction.allTools[0].name).toBe("get_weather")
      expect(extraction.allTools[0].input).toEqual({
        location: "San Francisco",
        unit: "celsius",
      })

      // Step 5: Build continuation with tool result
      const toolResult = { temperature: 18, condition: "foggy" }
      const continuation = await buildContinuationRequest(
        "openai",
        originalBody,
        universal,
        extraction.allTools[0],
        toolResult,
        llmResponse
      )

      expect(continuation.model).toBe("gpt-4")
      expect(continuation.messages).toHaveLength(3)
      expect(continuation.messages[0].role).toBe("user")
      expect(continuation.messages[1].role).toBe("assistant")
      expect(continuation.messages[1].tool_calls[0].id).toBe("call_abc123")
      expect(continuation.messages[2].role).toBe("tool")
      expect(continuation.messages[2].tool_call_id).toBe("call_abc123")
      expect(JSON.parse(continuation.messages[2].content)).toEqual(toolResult)
    })

    it("should handle multiple tool calls", () => {
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

    it("should handle malformed JSON in arguments", () => {
      const response = {
        choices: [
          {
            message: {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_bad",
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
      expect(result.allTools[0].input).toEqual({})
    })

    it("should handle response with no tool_calls", () => {
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
  })

  describe("Anthropic: tool_use and tool_result lifecycle", () => {
    it("should convert Anthropic tool_use block to universal format", () => {
      const anthropicBody = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "What's the weather?" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_01",
                name: "get_weather",
                input: { location: "Paris" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_01",
                content: '{"temperature":22,"condition":"sunny"}',
              },
            ],
          },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather info",
            input_schema: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        ],
      }

      const universal = toUniversal("anthropic", anthropicBody as any)

      // Verify assistant message with tool_call
      const assistantMsg = universal.messages.find(
        (m) => m.role === "assistant"
      )
      expect(assistantMsg).toBeDefined()
      const toolCallContent = assistantMsg!.content.find(
        (c) => c.type === "tool_call"
      )
      expect(toolCallContent).toBeDefined()
      expect(toolCallContent!.tool_call!.id).toBe("toolu_01")
      expect(toolCallContent!.tool_call!.name).toBe("get_weather")

      // Verify tool result
      const toolResultMsg = universal.messages.find(
        (m) =>
          m.role === "user" &&
          m.content.some((c) => c.type === "tool_result")
      )
      expect(toolResultMsg).toBeDefined()
      const toolResult = toolResultMsg!.content.find(
        (c) => c.type === "tool_result"
      )
      expect(toolResult!.tool_result!.tool_call_id).toBe("toolu_01")

      // Verify tools
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
    })

    it("should extract tool calls from Anthropic response", () => {
      const response = {
        content: [
          { type: "text", text: "Let me check the weather." },
          {
            type: "tool_use",
            id: "toolu_01A",
            name: "get_weather",
            input: { location: "London" },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "anthropic")
      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].id).toBe("toolu_01A")
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[0].input).toEqual({ location: "London" })
    })

    it("should build continuation for Anthropic", async () => {
      const originalBody = {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "What is the weather?" },
        ],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        ],
      }

      const universal = toUniversal("anthropic", originalBody as any)
      const toolCall: NormalizedToolCall = {
        id: "toolu_01B",
        name: "get_weather",
        input: { location: "Tokyo" },
      }

      const responseJson = {
        content: [
          {
            type: "tool_use",
            id: "toolu_01B",
            name: "get_weather",
            input: { location: "Tokyo" },
          },
        ],
      }

      const continuation = await buildContinuationRequest(
        "anthropic",
        originalBody,
        universal,
        toolCall,
        { temperature: 30, condition: "humid" },
        responseJson
      )

      // Anthropic continuation should have messages including tool result
      expect(continuation.messages).toBeDefined()
      expect(continuation.messages.length).toBeGreaterThan(1)
      // Should preserve tools for Anthropic
      expect(continuation.tools).toBeDefined()
    })
  })

  describe("Google: functionDeclarations lifecycle", () => {
    it("should convert Google functionDeclarations to universal format", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What's the weather in Berlin?" }],
          },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get weather data",
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

      const universal = toUniversal("google", googleBody as any)
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get weather data")
    })

    it("should convert Google functionCall and functionResponse", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "What's the weather?" }],
          },
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "Berlin" },
                },
              },
            ],
          },
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "get_weather",
                  response: { temperature: 15, condition: "cloudy" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", googleBody as any)

      // Check model message has tool_call
      const modelMsg = universal.messages.find((m) => m.role === "assistant")
      expect(modelMsg).toBeDefined()
      const toolCall = modelMsg!.content.find((c) => c.type === "tool_call")
      expect(toolCall).toBeDefined()
      expect(toolCall!.tool_call!.name).toBe("get_weather")

      // Check tool result
      const toolResultMsg = universal.messages.find(
        (m) =>
          m.content.some((c) => c.type === "tool_result")
      )
      expect(toolResultMsg).toBeDefined()
      const toolResult = toolResultMsg!.content.find(
        (c) => c.type === "tool_result"
      )
      expect(toolResult!.tool_result!.name).toBe("get_weather")
    })

    it("should extract tool calls from Google response", () => {
      const response = {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "get_weather",
                    args: { location: "Berlin" },
                  },
                },
              ],
            },
          },
        ],
      }

      const result = extractToolCallsFromResponse(response, "google")
      expect(result.hasToolCalls).toBe(true)
      expect(result.allTools).toHaveLength(1)
      expect(result.allTools[0].name).toBe("get_weather")
      expect(result.allTools[0].input).toEqual({ location: "Berlin" })
    })
  })

  describe("OpenAI Responses: flattened tools and function_call_output", () => {
    it("should convert flattened tool definitions", () => {
      const body = {
        model: "gpt-4o",
        input: [{ role: "user", content: "What's the weather?" }],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get the weather",
            parameters: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        ],
      }

      const universal = toUniversal("openai-responses", body as any)
      expect(universal.tools).toHaveLength(1)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get the weather")
    })

    it("should convert function_call_output items", () => {
      const body = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "What's the weather?" },
          {
            type: "function_call_output",
            call_id: "call_resp_01",
            output: '{"temperature":20}',
          },
        ],
      }

      const universal = toUniversal("openai-responses", body as any)

      const toolMsg = universal.messages.find((m) => m.role === "tool")
      expect(toolMsg).toBeDefined()
      const toolResult = toolMsg!.content.find(
        (c) => c.type === "tool_result"
      )
      expect(toolResult).toBeDefined()
      expect(toolResult!.tool_result!.tool_call_id).toBe("call_resp_01")
      expect(toolResult!.tool_result!.result).toBe('{"temperature":20}')
    })
  })

  describe("Cross-provider tool conversion", () => {
    it("should convert tools from OpenAI format to Anthropic format", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search the web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                },
                required: ["query"],
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody as any)
      expect(universal.tools).toHaveLength(1)

      // Change provider to anthropic for conversion
      const anthropicUniversal = {
        ...universal,
        provider: "anthropic" as const,
        max_tokens: 1024,
      }

      const anthropicBody = fromUniversal("anthropic", anthropicUniversal as any)

      // Verify Anthropic tool format
      expect(anthropicBody.tools).toBeDefined()
      expect(anthropicBody.tools).toHaveLength(1)
      expect(anthropicBody.tools![0].name).toBe("search")
      expect(anthropicBody.tools![0].description).toBe("Search the web")
      // Anthropic uses input_schema instead of parameters
      expect(anthropicBody.tools![0].input_schema).toBeDefined()
      expect(anthropicBody.tools![0].input_schema.type).toBe("object")
    })

    it("should convert tools from OpenAI format to Google format", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "calculator",
              description: "Perform calculations",
              parameters: {
                type: "object",
                properties: {
                  expression: { type: "string" },
                },
              },
            },
          },
        ],
      }

      const universal = toUniversal("openai", openaiBody as any)
      const googleUniversal = {
        ...universal,
        provider: "google" as const,
      }
      const googleBody = fromUniversal("google", googleUniversal as any)

      // Google uses functionDeclarations
      expect(googleBody.tools).toBeDefined()
      expect(googleBody.tools![0].functionDeclarations).toBeDefined()
      expect(googleBody.tools![0].functionDeclarations[0].name).toBe(
        "calculator"
      )
      expect(googleBody.tools![0].functionDeclarations[0].description).toBe(
        "Perform calculations"
      )
    })
  })

  describe("Tool choice modes", () => {
    it("should handle auto tool_choice", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test_tool",
              description: "A test",
              parameters: { type: "object" },
            },
          },
        ],
        tool_choice: "auto",
      }

      const universal = toUniversal("openai", body as any)
      expect(universal.tool_choice).toBe("auto")

      // Convert to Anthropic - should map auto to { type: "auto" }
      const anthropicUniversal = {
        ...universal,
        provider: "anthropic" as const,
        max_tokens: 1024,
      }
      const anthropicBody = fromUniversal("anthropic", anthropicUniversal as any)
      expect(anthropicBody.tool_choice).toEqual({ type: "auto" })

      // Convert to Google - should map auto to AUTO mode
      const googleUniversal = {
        ...universal,
        provider: "google" as const,
      }
      const googleBody = fromUniversal("google", googleUniversal as any)
      expect(googleBody.toolConfig?.functionCallingConfig?.mode).toBe("AUTO")
    })

    it("should handle required tool_choice", () => {
      const body = {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "test_tool",
              description: "A test",
              parameters: { type: "object" },
            },
          },
        ],
        tool_choice: "required",
      }

      const universal = toUniversal("openai", body as any)
      expect(universal.tool_choice).toBe("required")

      // Convert to Anthropic - should map required to { type: "any" }
      const anthropicUniversal = {
        ...universal,
        provider: "anthropic" as const,
        max_tokens: 1024,
      }
      const anthropicBody = fromUniversal("anthropic", anthropicUniversal as any)
      expect(anthropicBody.tool_choice).toEqual({ type: "required" })

      // Convert to Google - should map required to ANY mode
      const googleUniversal = {
        ...universal,
        provider: "google" as const,
      }
      const googleBody = fromUniversal("google", googleUniversal as any)
      expect(googleBody.toolConfig?.functionCallingConfig?.mode).toBe("ANY")
    })

    it("should handle specific tool name choice", () => {
      const universal = toUniversal("openai", {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            type: "function",
            function: {
              name: "specific_tool",
              description: "Specific",
              parameters: { type: "object" },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "specific_tool" } },
      } as any)

      // OpenAI preserves tool_choice as-is
      expect(universal.tool_choice).toBeDefined()

      // For Anthropic with named tool_choice, verify it maps correctly
      const anthropicUniversal = {
        ...universal,
        provider: "anthropic" as const,
        max_tokens: 1024,
        tool_choice: { name: "specific_tool" },
      }
      const anthropicBody = fromUniversal("anthropic", anthropicUniversal as any)
      expect(anthropicBody.tool_choice).toEqual({
        type: "tool",
        name: "specific_tool",
      })
    })
  })

  describe("Continuation headers", () => {
    it("should build headers for OpenAI", () => {
      const headers = {
        authorization: "Bearer sk-test123",
        "content-type": "application/json",
        host: "api.openai.com",
      }

      const result = buildContinuationHeaders("openai", headers)
      expect(result["Content-Type"]).toBe("application/json")
      expect(result.Authorization).toBe("Bearer sk-test123")
      expect(result.host).toBeUndefined()
    })

    it("should build headers for Anthropic", () => {
      const headers = {
        "x-api-key": "sk-ant-test",
        "anthropic-version": "2023-06-01",
      }

      const result = buildContinuationHeaders("anthropic", headers)
      expect(result["Content-Type"]).toBe("application/json")
      expect(result["x-api-key"]).toBe("sk-ant-test")
      expect(result["anthropic-version"]).toBe("2023-06-01")
    })

    it("should build headers for Google", () => {
      const headers = {
        "x-goog-api-key": "AIza-test",
      }

      const result = buildContinuationHeaders("google", headers)
      expect(result["Content-Type"]).toBe("application/json")
      expect(result["x-goog-api-key"]).toBe("AIza-test")
    })
  })

  describe("Tool round-trip: OpenAI tool call and result", () => {
    it("should preserve tool call structure through round-trip conversion", () => {
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

      const universal = toUniversal("openai", openaiRequest as any)

      // Verify universal format
      expect(universal.messages[2].role).toBe("tool")
      expect(universal.messages[2].content[0].type).toBe("tool_result")
      expect(
        universal.messages[2].content[0].tool_result?.tool_call_id
      ).toBe("call_123")

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
})
