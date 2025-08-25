import { describe, expect, it, vi } from "vitest"
import { handleUniversalRequest } from "../src/handler"
import { toUniversal, fromUniversal } from "../src/models"
import { OpenAIResponsesBody } from "../src/models/openai-responses-format"
// import { UniversalBody } from "../src/types/universal" // unused import

describe("Responses API Middleware Scenarios", () => {
  it("should inject context into Responses API requests", async () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are a helpful assistant.",
      input: "What's the weather like?"
    }

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: "resp_123", output_text: "I'll check the weather for you." })
    })
    global.fetch = mockFetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

    await handleUniversalRequest(
      "https://api.openai.com/v1/responses",
      responsesBody,
      { "Authorization": "Bearer test" },
      "POST",
      async (universal) => {
        // Inject context into the request
        const modifiedMessages = [
          ...universal.messages,
          {
            id: "injected_1",
            role: "system" as const,
            content: [{
              type: "text" as const,
              text: "User location: San Francisco, CA. Current date: 2024-01-20."
            }],
            metadata: {
              provider: "openai" as const,
              contextInjection: true
            }
          }
        ]

        return {
          request: {
            ...universal,
            messages: modifiedMessages
          },
          contextModified: true
        }
      }
    )

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    
    // The injected context should be part of the input array
    expect(Array.isArray(sentBody.input)).toBe(true)
    expect(sentBody.input).toHaveLength(2)
    expect(sentBody.input[1].role).toBe("system")
    expect(sentBody.input[1].content).toContain("San Francisco")
  })

  it("should handle continuation with injected memory", async () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Tell me more about that",
      previous_response_id: "resp_previous_123",
      store: true
    }

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: "resp_456", output_text: "Continuing from before..." })
    })
    global.fetch = mockFetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

    await handleUniversalRequest(
      "https://api.openai.com/v1/responses",
      responsesBody,
      { "Authorization": "Bearer test" },
      "POST",
      async (universal) => {
        // Simulate memory injection from previous conversations
        const memoryContext = {
          id: "memory_1",
          role: "assistant" as const,
          content: [{
            type: "text" as const,
            text: "Previously we discussed: Weather patterns in California."
          }],
          metadata: {
            provider: "openai" as const,
            memoryInjection: true,
            timestamp: Date.now() - 3600000 // 1 hour ago
          }
        }

        return {
          request: {
            ...universal,
            messages: [memoryContext, ...universal.messages],
            provider_params: {
              ...universal.provider_params,
              memory_enhanced: true
            }
          },
          contextModified: true
        }
      }
    )

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    
    expect(sentBody.previous_response_id).toBe("resp_previous_123")
    expect(sentBody.store).toBe(true)
    expect(Array.isArray(sentBody.input)).toBe(true)
    expect(sentBody.input[0].content).toContain("Previously we discussed")
  })

  it("should handle streaming responses", async () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Write a story",
      stream: true
    }

    // Mock SSE stream response
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: response.started\ndata: {"id":"resp_789"}\n\n'))
        controller.enqueue(new TextEncoder().encode('event: message.delta\ndata: {"content":"Once upon"}\n\n'))
        controller.enqueue(new TextEncoder().encode('event: message.delta\ndata: {"content":" a time"}\n\n'))
        controller.enqueue(new TextEncoder().encode('event: response.completed\ndata: {"id":"resp_789"}\n\n'))
        controller.close()
      }
    })

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      body: mockStream,
      headers: new Headers({ "content-type": "text/event-stream" })
    })
    global.fetch = mockFetch as unknown as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

    const result = await handleUniversalRequest(
      "https://api.openai.com/v1/responses",
      responsesBody,
      { "Authorization": "Bearer test" },
      "POST",
      async (universal) => ({ request: universal, contextModified: false })
    )

    const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(sentBody.stream).toBe(true)
    
    // Response should have the stream
    expect(result.response.body).toBeDefined()
  })
})

describe("Cross-Provider Translation via Responses", () => {
  it("should translate Responses format to Anthropic", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are Claude, a helpful assistant.",
      input: "Hello! What can you do?",
      temperature: 0.7,
      max_tokens: 500
    }

    // Convert to universal
    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses");
    
    // Change provider to Anthropic
    (universal as import("../src/types/universal").UniversalBody<"openai">).provider = "anthropic" as any
    
    // Convert to Anthropic format
    const anthropicBody = fromUniversal("anthropic", universal) as import("@anthropic-ai/sdk/resources/messages").MessageCreateParams
    
    expect(anthropicBody.model).toBe("gpt-5")
    expect(anthropicBody.system).toBe("You are Claude, a helpful assistant.")
    expect(anthropicBody.messages).toHaveLength(1)
    expect(anthropicBody.messages[0].role).toBe("user")
    expect(anthropicBody.messages[0].content).toHaveLength(1)
    expect((anthropicBody.messages![0].content![0] as { text: string }).text).toBe("Hello! What can you do?")
    expect(anthropicBody.temperature).toBe(0.7)
    expect(anthropicBody.max_tokens).toBe(500)
  })

  it("should translate Responses format to Google", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are Gemini, a helpful assistant.",
      input: [
        { role: "user", content: "What's 2+2?" },
        { role: "assistant", content: "2+2 equals 4." },
        { role: "user", content: "And 3+3?" }
      ]
    }

    // Convert to universal
    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses");
    
    // Change provider to Google
    (universal as import("../src/types/universal").UniversalBody<"openai">).provider = "google" as any
    
    // Convert to Google format
    const googleBody = fromUniversal("google", universal) as import("@google/generative-ai").GenerateContentRequest
    
    expect(googleBody.systemInstruction).toBeDefined()
    expect(
      googleBody.systemInstruction &&
        (googleBody.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text,
    ).toBe("You are Gemini, a helpful assistant.")
    expect(googleBody.contents).toHaveLength(3)
    expect(googleBody.contents[0].role).toBe("user")
    expect(googleBody.contents[0].parts[0].text).toBe("What's 2+2?")
    expect(googleBody.contents[1].role).toBe("model")
    expect(googleBody.contents[2].role).toBe("user")
  })
})

describe("Responses API Error Handling", () => {
  it("should handle malformed Responses input gracefully", () => {
    const malformedBodies = [
      { model: "gpt-5", input: null },
      { model: "gpt-5", input: undefined },
      { model: "gpt-5", input: [] }, // Empty array
      { model: "gpt-5", input: [{ role: "invalid", content: "test" }] }, // Invalid role
      { model: "gpt-5", input: { unexpected: "object" } }, // Wrong type
    ]

    malformedBodies.forEach((body: unknown) => {
      expect(() => {
        const universal = toUniversal("openai", body as import("../src/models/openai-responses-format").OpenAIResponsesBody, "https://api.openai.com/v1/responses")
        const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses")
        
        // Should not throw, but handle gracefully
        expect(backToResponses).toBeDefined()
      }).not.toThrow()
    })
  })

  it("should preserve unknown fields in provider_params", () => {
    const responsesBody: OpenAIResponsesBody & Record<string, unknown> = {
      model: "gpt-5",
      input: "Test",
      // Unknown/future fields
      experimental_feature: "value",
      beta_flag: true,
      custom_config: {
        nested: "data"
      }
    }

    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
    
    // Unknown fields should be preserved somewhere
    expect(universal._original?.raw).toEqual(responsesBody)
    
    const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses")
    
    // Perfect reconstruction should include unknown fields
    expect(backToResponses).toEqual(responsesBody)
  })
})

describe("Responses API with Tools", () => {
  it("should handle tool submission flow", () => {
    // First request with tool call
    const request1: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "What's the weather in Tokyo?",
      tools: [{
        type: "function",
        function: {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" }
            }
          }
        }
      }]
    }

    const universal1 = toUniversal("openai", request1, "https://api.openai.com/v1/responses")
    expect(universal1.tools).toHaveLength(1)
    expect(universal1.tools![0].name).toBe("get_weather")

    // Simulate tool response continuation
    const toolSubmission: OpenAIResponsesBody = {
      model: "gpt-5",
      input: [
        { role: "user", content: "What's the weather in Tokyo?" },
        { 
          role: "assistant", 
          content: JSON.stringify({
            tool_calls: [{
              id: "call_123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"location": "Tokyo"}'
              }
            }]
          })
        },
        {
          role: "user",
          content: JSON.stringify({
            tool_outputs: [{
              tool_call_id: "call_123",
              output: '{"temperature": 22, "condition": "sunny"}'
            }]
          })
        }
      ],
      previous_response_id: "resp_with_tool_call"
    }

    const universal2 = toUniversal("openai", toolSubmission, "https://api.openai.com/v1/responses")
    expect(universal2.messages).toHaveLength(3)
    expect(universal2.provider_params?.previous_response_id).toBe("resp_with_tool_call")

    const backToResponses = fromUniversal("openai", universal2, "https://api.openai.com/v1/responses")
    expect(((backToResponses as import("../src/models/openai-responses-format").OpenAIResponsesBody).input as Exclude<import("../src/models/openai-responses-format").OpenAIResponsesBody["input"], string>)[2].content as string).toContain("tool_outputs")
  })

  it("should handle built-in tool combinations", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Research and analyze the latest AI developments, create a summary report with code examples",
      tools: [
        { type: "web_search_preview" },
        { type: "file_search" },
        { type: "code_interpreter" },
        {
          type: "function",
          function: {
            name: "save_report",
            description: "Save the report",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" }
              }
            }
          }
        }
      ],
      tool_choice: "auto"
    }

    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
    
    // Function tools in universal.tools
    expect(universal.tools).toHaveLength(1)
    expect(universal.tools![0].name).toBe("save_report")
    
    // All tools preserved in provider_params
    expect(universal.provider_params?.responses_tools).toHaveLength(4)
    expect(universal.provider_params?.responses_tool_choice).toBe("auto")
    
    const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses") as import("../src/models/openai-responses-format").OpenAIResponsesBody
    expect(backToResponses.tools).toHaveLength(4)
    expect(backToResponses.tool_choice).toBe("auto")
  })
})

describe("Responses API State Management", () => {
  it("should handle complex conversation state", () => {
    // Simulate a multi-turn conversation with state
    const turns = [
      {
        input: "Let's discuss machine learning",
        response_id: null as string | null,
        store: true
      },
      {
        input: "What about neural networks?",
        response_id: "resp_001",
        store: true
      },
      {
        input: "Can you explain backpropagation?",
        response_id: "resp_002",
        store: true
      },
      {
        input: "How does it relate to gradient descent?",
        response_id: "resp_003",
        store: false // Don't store this one
      }
    ]

    turns.forEach((turn, index) => {
      const body: OpenAIResponsesBody = {
        model: "gpt-5",
        input: turn.input,
        store: turn.store
      }

      if (turn.response_id) {
        body.previous_response_id = turn.response_id
      }

      const universal = toUniversal("openai", body, "https://api.openai.com/v1/responses")
      
      expect(universal.messages[0].content[0].text).toBe(turn.input)
      expect(universal.provider_params?.store).toBe(turn.store)
      
      if (turn.response_id) {
        expect(universal.provider_params?.previous_response_id).toBe(turn.response_id)
      }

      const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses") as import("../src/models/openai-responses-format").OpenAIResponsesBody
      
      expect(backToResponses.input).toBe(turn.input)
      expect(backToResponses.store).toBe(turn.store)
      
      if (turn.response_id) {
        expect(backToResponses.previous_response_id).toBe(turn.response_id)
      }
    })
  })

  it("should handle ZDR with encrypted reasoning items", () => {
    const zdrBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Solve this complex problem that requires reasoning",
      store: false, // Required for ZDR
      include: ["reasoning.encrypted_content"],
      metadata: {
        organization_type: "zdr",
        compliance_mode: true
      }
    }

    const universal = toUniversal("openai", zdrBody, "https://api.openai.com/v1/responses")
    
    expect(universal.provider_params?.store).toBe(false)
    expect(universal.provider_params?.include).toContain("reasoning.encrypted_content")
    expect(universal.provider_params?.metadata).toEqual({
      organization_type: "zdr",
      compliance_mode: true
    })

    // When continuing with encrypted reasoning
    const continuationBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Continue solving",
      store: false,
      include: ["reasoning.encrypted_content"],
      // Would include encrypted_content from previous response
      metadata: {
        encrypted_reasoning_token: "encrypted_base64_string_here"
      }
    }

    const universal2 = toUniversal("openai", continuationBody, "https://api.openai.com/v1/responses")
    const backToResponses = fromUniversal("openai", universal2, "https://api.openai.com/v1/responses") as import("../src/models/openai-responses-format").OpenAIResponsesBody
    
    expect(backToResponses.store).toBe(false)
    expect(backToResponses.include).toContain("reasoning.encrypted_content")
  })
})
