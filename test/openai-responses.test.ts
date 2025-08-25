import { describe, expect, it, vi } from "vitest"
import {
  openaiResponsesToUniversal,
  universalToOpenAIResponses,
  OpenAIResponsesBody,
} from "../src/models/openai-responses-format"
import { isOpenAIResponsesEndpoint } from "../src/models/detector"
import { toUniversal, fromUniversal } from "../src/models"

describe("OpenAI Responses API Detection", () => {
  it("should detect Responses API by URL path", () => {
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/responses", {})).toBe(true)
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/responses/submit", {})).toBe(true)
    expect(isOpenAIResponsesEndpoint("https://example.com/responses", {})).toBe(true)
  })

  it("should not detect Chat Completions as Responses", () => {
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/chat/completions", {})).toBe(false)
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/completions", {})).toBe(false)
  })

  it("should detect Responses API by body fields", () => {
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/unknown", {
      input: "Hello",
      instructions: "Be helpful"
    })).toBe(true)
    
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/unknown", {
      previous_response_id: "resp_123"
    })).toBe(true)
    
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/unknown", {
      include: ["reasoning.encrypted_content"]
    })).toBe(true)
  })

  it("should not detect Chat body as Responses", () => {
    expect(isOpenAIResponsesEndpoint("https://api.openai.com/v1/unknown", {
      messages: [{ role: "user", content: "Hello" }]
    })).toBe(false)
  })
})

describe("OpenAI Responses to Universal", () => {
  it("should convert simple string input", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are a helpful assistant.",
      input: "Hello, how are you?"
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.model).toBe("gpt-5")
    expect(universal.system).toBe("You are a helpful assistant.")
    expect(universal.messages).toHaveLength(1)
    expect(universal.messages[0].role).toBe("user")
    expect(universal.messages[0].content).toHaveLength(1)
    expect(universal.messages[0].content[0].type).toBe("text")
    expect(universal.messages[0].content[0].text).toBe("Hello, how are you?")
  })

  it("should convert message array input", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
        { role: "user", content: "How are you?" }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.messages).toHaveLength(3)
    expect(universal.messages[0].role).toBe("user")
    expect(universal.messages[0].content[0].text).toBe("Hello!")
    expect(universal.messages[1].role).toBe("assistant")
    expect(universal.messages[1].content[0].text).toBe("Hi there!")
    expect(universal.messages[2].role).toBe("user")
    expect(universal.messages[2].content[0].text).toBe("How are you?")
  })

  it("should preserve state management fields", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Continue our conversation",
      previous_response_id: "resp_abc123",
      store: true,
      include: ["reasoning.encrypted_content"]
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.provider_params?.previous_response_id).toBe("resp_abc123")
    expect(universal.provider_params?.store).toBe(true)
    expect(universal.provider_params?.include).toEqual(["reasoning.encrypted_content"])
  })

  it("should preserve built-in tools", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Search for information",
      tools: [
        { type: "web_search_preview" },
        { type: "file_search" }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.provider_params?.responses_tools).toEqual([
      { type: "web_search_preview" },
      { type: "file_search" }
    ])
  })

  it("should handle function tools", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Calculate something",
      tools: [
        {
          type: "function",
          function: {
            name: "calculate",
            description: "Perform calculations",
            parameters: { type: "object", properties: {} }
          }
        }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.tools).toHaveLength(1)
    expect(universal.tools![0].name).toBe("calculate")
    expect(universal.tools![0].description).toBe("Perform calculations")
  })

  it("should preserve generation parameters", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Generate text",
      temperature: 0.7,
      max_tokens: 150,
      top_p: 0.9,
      stream: true
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.temperature).toBe(0.7)
    expect(universal.max_tokens).toBe(150)
    expect(universal.top_p).toBe(0.9)
    expect(universal.stream).toBe(true)
  })

  it("should preserve Responses-specific fields", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Test",
      text: {
        format: "json_object"
      },
      modalities: ["text", "image"],
      attachments: [{ id: "file-123", type: "file" }],
      metadata: { session: "abc" }
    }

    const universal = openaiResponsesToUniversal(responsesBody)

    expect(universal.provider_params?.text).toEqual({ format: "json_object" })
    expect(universal.provider_params?.modalities).toEqual(["text", "image"])
    expect(universal.provider_params?.attachments).toEqual([{ id: "file-123", type: "file" }])
    expect(universal.provider_params?.metadata).toEqual({ session: "abc" })
  })
})

describe("Universal to OpenAI Responses", () => {
  it("should convert back to simple string input", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are a helpful assistant.",
      input: "Hello, how are you?"
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    const backToResponses = universalToOpenAIResponses(universal)

    expect(backToResponses.model).toBe("gpt-5")
    expect(backToResponses.instructions).toBe("You are a helpful assistant.")
    expect(backToResponses.input).toBe("Hello, how are you?")
  })

  it("should convert back to message array", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    const backToResponses = universalToOpenAIResponses(universal)

    expect(Array.isArray(backToResponses.input)).toBe(true)
    const input = backToResponses.input as NonNullable<Extract<OpenAIResponsesBody["input"], any[]>>
    expect(input).toHaveLength(2)
    expect(input[0].role).toBe("user")
    expect(input[0].content).toBe("Hello!")
    expect(input[1].role).toBe("assistant")
    expect(input[1].content).toBe("Hi there!")
  })

  it("should preserve state management on round-trip", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Continue",
      previous_response_id: "resp_xyz",
      store: false,
      include: ["reasoning.encrypted_content"]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    const backToResponses = universalToOpenAIResponses(universal)

    expect(backToResponses.previous_response_id).toBe("resp_xyz")
    expect(backToResponses.store).toBe(false)
    expect(backToResponses.include).toEqual(["reasoning.encrypted_content"])
  })

  it("should preserve tools on round-trip", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Search",
      tools: [
        { type: "web_search_preview" },
        {
          type: "function",
          function: {
            name: "calc",
            description: "Calculate",
            parameters: {}
          }
        }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    const backToResponses = universalToOpenAIResponses(universal)

    expect(backToResponses.tools).toHaveLength(2)
    expect(backToResponses.tools![0]).toEqual({ type: "web_search_preview" })
    expect(backToResponses.tools![1]).toEqual({
      type: "function",
      function: {
        name: "calc",
        description: "Calculate",
        parameters: {}
      }
    })
  })

  it("should do perfect reconstruction when unmodified", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "Be helpful",
      input: "Hello",
      temperature: 0.8,
      max_tokens: 200,
      previous_response_id: "resp_123",
      store: true,
      tools: [{ type: "web_search_preview" }],
      text: { format: "json_object" },
      modalities: ["text"],
      attachments: [{ id: "file-1" }],
      metadata: { key: "value" }
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    const backToResponses = universalToOpenAIResponses(universal)

    // Should be exactly the same
    expect(backToResponses).toEqual(responsesBody)
  })
})

describe("Integration with main translator", () => {
  it("should route Responses API through correct translator", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "You are helpful",
      input: "Hello!"
    }

    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
    
    expect(universal.system).toBe("You are helpful")
    expect(universal.messages[0].content[0].text).toBe("Hello!")
    
    const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses")
    
    expect((backToResponses as OpenAIResponsesBody).instructions).toBe("You are helpful")
    expect((backToResponses as OpenAIResponsesBody).input).toBe("Hello!")
  })

  it("should route Chat Completions through normal translator", () => {
    const chatBody = {
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello!" }
      ]
    }

    const universal = toUniversal("openai", chatBody as import("openai/resources/chat/completions").ChatCompletionCreateParams, "https://api.openai.com/v1/chat/completions")
    
    expect(universal.system).toBe("You are helpful")
    expect(universal.messages[0].content[0].text).toBe("Hello!")
    
    const backToChat = fromUniversal("openai", universal, "https://api.openai.com/v1/chat/completions") as import("openai/resources/chat/completions").ChatCompletionCreateParams
    
    expect(backToChat.messages).toHaveLength(2)
    expect(backToChat.messages[0].role).toBe("system")
  })
})

describe("Edge Cases and Complex Scenarios", () => {
  it("should handle multimodal input arrays", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            { 
              type: "image_url", 
              image_url: { 
                url: "https://example.com/image.jpg",
                detail: "high"
              }
            }
          ]
        },
        {
          role: "assistant",
          content: "I can see a beautiful landscape."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "And this one?" },
            { 
              type: "image_url", 
              image_url: { 
                url: "data:image/jpeg;base64,iVBORw0KGgo..."
              }
            }
          ]
        }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.messages).toHaveLength(3)
    expect(universal.messages[0].content).toHaveLength(2)
    expect(universal.messages[0].content[0].type).toBe("text")
    expect(universal.messages[0].content[1].type).toBe("image")
    expect(universal.messages[0].content[1].media?.url).toBe("https://example.com/image.jpg")
    expect(universal.messages[0].content[1].media?.detail).toBe("high")
    
    expect(universal.messages[2].content).toHaveLength(2)
    expect(universal.messages[2].content[1].media?.url).toContain("data:image/jpeg;base64")
    
    const backToResponses = universalToOpenAIResponses(universal)
    const inputArray = backToResponses.input as Exclude<OpenAIResponsesBody["input"], string>
    const contentArray = inputArray[0].content as Exclude<(typeof inputArray)[number]["content"], string>
    const imagePart = contentArray[1] as { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    expect(imagePart.image_url.detail).toBe("high")
  })

  it("should handle tool_choice variations", () => {
    const testCases = [
      { tool_choice: "auto" },
      { tool_choice: "required" },
      { tool_choice: "none" },
      { tool_choice: { type: "function", function: { name: "search" } } }
    ]

    testCases.forEach(({ tool_choice }) => {
      const responsesBody: OpenAIResponsesBody = {
        model: "gpt-5",
        input: "Test",
        tools: [{
          type: "function",
          function: {
            name: "search",
            description: "Search the web",
            parameters: {}
          }
        }],
        tool_choice: tool_choice as OpenAIResponsesBody["tool_choice"]
      }

      const universal = openaiResponsesToUniversal(responsesBody)
      const backToResponses = universalToOpenAIResponses(universal)
      
      expect(backToResponses.tool_choice).toEqual(tool_choice)
    })
  })

  it("should handle ZDR encrypted reasoning", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Solve this complex problem",
      store: false,
      include: ["reasoning.encrypted_content"]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.provider_params?.store).toBe(false)
    expect(universal.provider_params?.include).toEqual(["reasoning.encrypted_content"])
    
    const backToResponses = universalToOpenAIResponses(universal)
    
    expect(backToResponses.store).toBe(false)
    expect(backToResponses.include).toEqual(["reasoning.encrypted_content"])
  })

  it("should handle empty or undefined input gracefully", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: ""
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.messages).toHaveLength(1)
    expect(universal.messages[0].content[0].text).toBe("")
    
    const backToResponses = universalToOpenAIResponses(universal)
    expect(backToResponses.input).toBe("")
  })

  it("should handle system role in input array", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: [
        { role: "system", content: "You are a pirate" },
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Ahoy!" }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.messages).toHaveLength(3)
    expect(universal.messages[0].role).toBe("system")
    expect(universal.messages[0].content[0].text).toBe("You are a pirate")
    
    const backToResponses = universalToOpenAIResponses(universal)
    expect(Array.isArray(backToResponses.input)).toBe(true)
    const arrInput = backToResponses.input as Extract<OpenAIResponsesBody["input"], any[]>
    expect(arrInput[0].role).toBe("system")
  })

  it("should preserve structured output with json_schema", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Generate user data",
      text: {
        format: "json_schema",
        json_schema: {
          name: "user_response",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" }
            },
            required: ["name", "age"]
          }
        }
      }
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.provider_params?.text).toEqual({
      format: "json_schema",
      json_schema: {
        name: "user_response",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" }
          },
          required: ["name", "age"]
        }
      }
    })
    
    const backToResponses = universalToOpenAIResponses(universal)
    expect(backToResponses.text).toEqual(responsesBody.text)
  })

  it("should handle mixed built-in and function tools", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Help me research and calculate",
      tools: [
        { type: "web_search_preview" },
        { type: "code_interpreter" },
        {
          type: "function",
          function: {
            name: "calculate_tax",
            description: "Calculate tax",
            parameters: {
              type: "object",
              properties: {
                amount: { type: "number" },
                rate: { type: "number" }
              }
            }
          }
        },
        { type: "file_search" }
      ]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    // Function tools should be in universal.tools
    expect(universal.tools).toHaveLength(1)
    expect(universal.tools![0].name).toBe("calculate_tax")
    
    // All tools should be preserved in provider_params
    expect(universal.provider_params?.responses_tools).toHaveLength(4)
    
    const backToResponses = universalToOpenAIResponses(universal)
    expect(backToResponses.tools).toEqual(responsesBody.tools)
  })

  it("should handle attachments and metadata", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Analyze these files",
      attachments: [
        { 
          id: "file-abc123",
          type: "file",
          name: "report.pdf"
        },
        {
          id: "file-def456",
          type: "image",
          name: "chart.png"
        }
      ],
      metadata: {
        session_id: "session-789",
        user_id: "user-123",
        custom_field: "value"
      }
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.provider_params?.attachments).toEqual(responsesBody.attachments)
    expect(universal.provider_params?.metadata).toEqual(responsesBody.metadata)
    
    const backToResponses = universalToOpenAIResponses(universal)
    
    expect(backToResponses.attachments).toEqual(responsesBody.attachments)
    expect(backToResponses.metadata).toEqual(responsesBody.metadata)
  })

  it("should handle modalities", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      input: "Generate multimodal content",
      modalities: ["text", "image", "audio"]
    }

    const universal = openaiResponsesToUniversal(responsesBody)
    
    expect(universal.provider_params?.modalities).toEqual(["text", "image", "audio"])
    
    const backToResponses = universalToOpenAIResponses(universal)
    
    expect(backToResponses.modalities).toEqual(["text", "image", "audio"])
  })
})

describe("Handler Integration", () => {
  it("should work with handleUniversalRequest edit function", async () => {
    const { handleUniversalRequest } = await import("../src/handler")
    
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-5",
      instructions: "Be helpful",
      input: "Hello",
      previous_response_id: "resp_123"
    }

    let capturedUniversal: any = null
    let editedUniversal: any = null

    // Mock the fetch to capture what would be sent
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: "resp_456", output_text: "Hi there!" })
    }) as (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

    try {
      await handleUniversalRequest(
        "https://api.openai.com/v1/responses",
        responsesBody,
        { "Authorization": "Bearer test" },
        "POST",
        async (universal) => {
          capturedUniversal = JSON.parse(JSON.stringify(universal))
          
          // Simulate editing the request
          editedUniversal = {
            ...universal,
            system: (universal.system || "") + " Always be concise.",
            provider_params: {
              ...universal.provider_params,
              temperature: 0.5
            }
          }
          
          return { request: editedUniversal, contextModified: true }
        }
      )

      // Verify the universal format was correct
      expect(capturedUniversal.system).toBe("Be helpful")
      expect(capturedUniversal.messages[0].content[0].text).toBe("Hello")
      expect(capturedUniversal.provider_params.previous_response_id).toBe("resp_123")
      
      // Verify the edit was applied
      expect(editedUniversal.system).toBe("Be helpful Always be concise.")
      expect(editedUniversal.provider_params.temperature).toBe(0.5)
      
      // Verify the correct body was sent
      const sentBody = JSON.parse((global.fetch as unknown as { mock: { calls: [RequestInfo, RequestInit][] } }).mock.calls[0][1].body as string)
      expect(sentBody.instructions).toBe("Be helpful Always be concise.")
      expect(sentBody.input).toBe("Hello")
      expect(sentBody.previous_response_id).toBe("resp_123")
    } finally {
      global.fetch = originalFetch
    }
  })
})
