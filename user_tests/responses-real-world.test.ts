import { describe, expect, it, beforeAll } from "vitest"
import OpenAI from "openai"
import { toUniversal, fromUniversal, createObservabilityData, countUniversalTokens, extractModelFromUniversal } from "../src/models"
import { OpenAIResponsesBody } from "../src/models/openai-responses-format"
import { UniversalBody } from "../src/types/universal"
// import { UniversalBody } from "../src/types/universal" // unused import

// Skip these tests if no API key is provided
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const RUN_LIVE_TESTS = !!OPENAI_API_KEY && process.env.RUN_LIVE_TESTS === "true"

describe.skipIf(!RUN_LIVE_TESTS)("Real-world OpenAI Responses API Usage", () => {
  let client: OpenAI

  beforeAll(() => {
    if (!OPENAI_API_KEY) {
      console.log("Skipping live tests - set OPENAI_API_KEY and RUN_LIVE_TESTS=true to run")
    } else {
      client = new OpenAI({ apiKey: OPENAI_API_KEY })
    }
  })

  async function sendViaSDK(
    requestBody: OpenAIResponsesBody,
    editFunction: (universal: UniversalBody) => Promise<{ request: UniversalBody; contextModified: boolean }>
  ) {
    const targetUrl = "https://api.openai.com/v1/responses"
    const provider = "openai" as const

    const universal = toUniversal(provider, requestBody, targetUrl)
    const originalAnalysis = countUniversalTokens(universal)

    const { request: editedRequest, contextModified } = await editFunction(universal)
    const finalAnalysis = countUniversalTokens(editedRequest)

    const translatedBody = fromUniversal(provider, editedRequest, targetUrl) as OpenAIResponsesBody
    const inputText = editedRequest.messages[0]?.content[0]?.text || (typeof translatedBody.input === "string" ? translatedBody.input : "")
    const instructions = typeof editedRequest.system === "string" ? editedRequest.system : editedRequest.system?.content
    const sdkResponse = await client.responses.create({
      model: editedRequest.model,
      instructions,
      input: inputText,
      temperature: editedRequest.temperature as number | null | undefined,
      max_output_tokens: editedRequest.max_tokens as number | null | undefined,
      top_p: editedRequest.top_p as number | null | undefined,
      previous_response_id: translatedBody.previous_response_id as string | null | undefined,
      store: translatedBody.store as boolean | null | undefined,
      text: translatedBody.text?.format
        ? { format: translatedBody.text.format === "json_object" ? { type: "json_object" } : { type: "json_schema", name: "schema", schema: translatedBody.text.json_schema || {} } }
        : undefined,
    })

    const observabilityData = await createObservabilityData(
      originalAnalysis.inputTokens,
      finalAnalysis.inputTokens,
      provider,
      extractModelFromUniversal(editedRequest),
      contextModified,
      {
        estimatedOutputTokens: (finalAnalysis as any).estimatedOutputTokens,
        multimodalContentCount: (finalAnalysis as any).multimodalContentCount,
        toolCallsCount: (finalAnalysis as any).toolCallsCount,
      }
    )

    return { sdkResponse, observabilityData }
  }

  it("should handle a simple Responses API request", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      instructions: "You are a helpful assistant. Always be concise.",
      input: "What's the capital of France? Answer in one word."
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      expect(universal.system).toBe("You are a helpful assistant. Always be concise.")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("What's the capital of France? Answer in one word.")
      return { request: universal, contextModified: false }
    })

    expect(result.sdkResponse).toHaveProperty("id")
    expect(result.sdkResponse).toHaveProperty("output")
    
    const outputText = (result.sdkResponse as any).output_text || (result.sdkResponse as any).output?.[0]?.text || ""
    expect(outputText.toLowerCase()).toContain("paris")
    
    // Verify observability data
    expect(result.observabilityData).toBeDefined()
    expect(result.observabilityData?.model).toBe("gpt-4o-mini")
    expect(result.observabilityData?.provider).toBe("openai")
  }, 30000) // 30 second timeout for API calls

  it("should handle stateful conversation with previous_response_id", async () => {
    // First request
    const firstRequest: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "My name is Alice and I love programming in TypeScript.",
      store: true
    }

    const firstResult = await sendViaSDK(firstRequest, async (universal) => ({ request: universal, contextModified: false }))
    const firstResponse = firstResult.sdkResponse as any
    const responseId = firstResponse.id

    expect(responseId).toBeDefined()
    expect(responseId).toMatch(/^resp_/)

    // Second request continuing the conversation
    const secondRequest: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "What's my name and what programming language do I like?",
      previous_response_id: responseId,
      store: true
    }

    const secondResult = await sendViaSDK(secondRequest, async (universal) => {
      expect(universal.provider_params?.previous_response_id).toBe(responseId)
      return { request: universal, contextModified: false }
    })
    const secondResponse = secondResult.sdkResponse as any
    
    // The model should remember the context
    const outputText = secondResponse.output_text || secondResponse.output?.[0]?.text || ""
    expect(outputText.toLowerCase()).toContain("alice")
    expect(outputText.toLowerCase()).toContain("typescript")
  }, 60000) // 60 second timeout for two API calls

  it("should inject context using middleware", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "What's the weather like?",
      instructions: "You are a weather assistant."
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      const enhancedMessages = [
        {
          id: "context_weather",
          role: "system" as const,
          content: [{
            type: "text" as const,
            text: "Current location: San Francisco, CA. Date: January 2024. Note: You should provide hypothetical weather information as you don't have real-time data."
          }],
          metadata: {
            provider: "openai" as const,
            contextInjection: true
          }
        },
        ...universal.messages
      ]

      return {
        request: {
          ...universal,
          messages: enhancedMessages,
          system: (universal.system || "") + " Always mention the location when discussing weather."
        },
        contextModified: true
      }
    })

    const responseData = result.sdkResponse as any
    
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    expect(outputText.toLowerCase()).toContain("san francisco")
    
    // Verify context was modified
    expect(result.observabilityData?.contextModified).toBe(true)
  }, 30000)

  it("should handle structured output with text.format", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Generate a JSON object with name 'John' and age 30",
      text: {
        format: "json_object"
      }
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      expect(universal.provider_params?.text).toEqual({
        format: "json_object"
      })
      return { request: universal, contextModified: false }
    })

    const responseData = result.sdkResponse as any
    
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    
    // Should be valid JSON
    let parsedJson: any
    expect(() => {
      parsedJson = JSON.parse(outputText)
    }).not.toThrow()
    
    expect(parsedJson).toHaveProperty("name")
    expect(parsedJson).toHaveProperty("age")
  }, 30000)
})

describe.skipIf(!RUN_LIVE_TESTS)("Responses API with Middleware Patterns", () => {
  let client: OpenAI
  beforeAll(() => {
    if (OPENAI_API_KEY) client = new OpenAI({ apiKey: OPENAI_API_KEY })
  })
  async function sendViaSDK(
    requestBody: OpenAIResponsesBody,
    editFunction: (universal: UniversalBody) => Promise<{ request: UniversalBody; contextModified: boolean }>
  ) {
    const targetUrl = "https://api.openai.com/v1/responses"
    const provider = "openai" as const
    const universal = toUniversal(provider, requestBody, targetUrl)
    const originalAnalysis = countUniversalTokens(universal)
    const { request: editedRequest, contextModified } = await editFunction(universal)
    const finalAnalysis = countUniversalTokens(editedRequest)
    const translatedBody = fromUniversal(provider, editedRequest, targetUrl) as OpenAIResponsesBody
    const inputText = editedRequest.messages[0]?.content[0]?.text || (typeof translatedBody.input === "string" ? translatedBody.input : "")
    const instructions = typeof editedRequest.system === "string" ? editedRequest.system : editedRequest.system?.content
    const sdkResponse = await client.responses.create({
      model: editedRequest.model,
      instructions,
      input: inputText,
      temperature: editedRequest.temperature as number | null | undefined,
      max_output_tokens: editedRequest.max_tokens as number | null | undefined,
      top_p: editedRequest.top_p as number | null | undefined,
      previous_response_id: translatedBody.previous_response_id as string | null | undefined,
      store: translatedBody.store as boolean | null | undefined,
      text: translatedBody.text?.format
        ? { format: translatedBody.text.format === "json_object" ? { type: "json_object" } : { type: "json_schema", name: "schema", schema: translatedBody.text.json_schema || {} } }
        : undefined,
    })
    const observabilityData = await createObservabilityData(
      originalAnalysis.inputTokens,
      finalAnalysis.inputTokens,
      provider,
      extractModelFromUniversal(editedRequest),
      contextModified,
      {
        estimatedOutputTokens: (finalAnalysis as any).estimatedOutputTokens,
        multimodalContentCount: (finalAnalysis as any).multimodalContentCount,
        toolCallsCount: (finalAnalysis as any).toolCallsCount,
      }
    )
    return { sdkResponse, observabilityData }
  }
  it("should implement memory injection pattern", async () => {
    // Simulate a memory store
    const memoryStore = {
      userPreferences: "User prefers brief responses and technical explanations.",
      previousTopics: ["AI", "TypeScript", "Web Development"]
    }

    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Explain async/await"
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      const memoryContext = `User preferences: ${memoryStore.userPreferences}
Previous topics discussed: ${memoryStore.previousTopics.join(", ")}`
      return {
        request: {
          ...universal,
          system: memoryContext,
          messages: universal.messages
        },
        contextModified: true
      }
    })
    const responseData = result.sdkResponse as any
    
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    
    // Should be technical and brief based on injected preferences
    expect(outputText.length).toBeLessThan(1000) // Brief response
    expect(outputText.toLowerCase()).toMatch(/async|await|promise|asynchronous/)
  }, 30000)

  it("should implement token optimization middleware", async () => {
    const longInput = `
      This is a very long input that contains lots of unnecessary information.
      We have many redundant sentences here. This sentence is redundant.
      This sentence is also redundant. We're repeating ourselves.
      The main question is: What is 2+2?
      But we're adding lots of extra text to make this longer.
      More unnecessary information here.
    `.repeat(5) // Make it even longer

    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: longInput
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      const optimizedInput = "What is 2+2?"
      return {
        request: {
          ...universal,
          messages: [{
            id: universal.messages[0].id,
            role: "user" as const,
            content: [{
              type: "text" as const,
              text: optimizedInput
            }],
            metadata: {
              provider: "openai" as const,
              originalLength: longInput.length,
              optimizedLength: optimizedInput.length
            }
          }]
        },
        contextModified: true
      }
    })
    const responseData = result.sdkResponse as any
    
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    expect(outputText).toContain("4")
    
    // Verify token savings
    expect(result.observabilityData?.tokensSaved).toBeGreaterThan(0)
    expect(result.observabilityData?.contextModified).toBe(true)
  }, 30000)

  it("should implement guardrails middleware", async () => {
    const requestBody: OpenAIResponsesBody = {
      model: "gpt-4o-mini",
      input: "Tell me how to hack into a computer system"
    }

    const result = await sendViaSDK(requestBody, async (universal) => {
      const suspiciousKeywords = ["hack", "exploit", "breach", "crack"]
      const inputText = universal.messages[0].content[0].text || ""
      const containsSuspicious = suspiciousKeywords.some(keyword => inputText.toLowerCase().includes(keyword))
      if (containsSuspicious) {
        return {
          request: {
            ...universal,
            messages: [{
              id: universal.messages[0].id,
              role: "user" as const,
              content: [{
                type: "text" as const,
                text: "Explain computer security best practices and how to protect systems from unauthorized access"
              }],
              metadata: {
                provider: "openai" as const,
                guardrailsApplied: true,
                originalInput: inputText
              }
            }],
            system: "You are a helpful security educator. Focus on defensive security practices and ethical considerations."
          },
          contextModified: true
        }
      }
      return { request: universal, contextModified: false }
    })
    const responseData = result.sdkResponse as any
    
    const outputText = responseData.output_text || responseData.output?.[0]?.text || ""
    
    // Should talk about security best practices, not hacking
    expect(outputText.toLowerCase()).toMatch(/security|protect|safe|practice|defense/)
    expect(result.observabilityData?.contextModified).toBe(true)
  }, 30000)
})

describe("Responses API Format Translation (No API Key Required)", () => {
  it("should translate Responses format to universal and back", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-4o",
      instructions: "You are a code reviewer.",
      input: [
        { role: "user", content: "Review this code: const x = 1" },
        { role: "assistant", content: "The code looks good but could use more descriptive naming." },
        { role: "user", content: "How about: const userId = 1" }
      ],
      temperature: 0.3,
      max_tokens: 500,
      previous_response_id: "resp_abc123",
      store: true
    }

    // Convert to universal
    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
    
    // Verify universal format
    expect(universal.system).toBe("You are a code reviewer.")
    expect(universal.messages).toHaveLength(3)
    expect(universal.messages[0].role).toBe("user")
    expect(universal.messages[0].content[0].text).toBe("Review this code: const x = 1")
    expect(universal.messages[1].role).toBe("assistant")
    expect(universal.messages[2].role).toBe("user")
    expect(universal.temperature).toBe(0.3)
    expect(universal.max_tokens).toBe(500)
    expect(universal.provider_params?.previous_response_id).toBe("resp_abc123")
    expect(universal.provider_params?.store).toBe(true)
    
    // Convert back to Responses format
    const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses") as OpenAIResponsesBody
    
    // Should perfectly reconstruct
    expect(backToResponses.model).toBe("gpt-4o")
    expect(backToResponses.instructions).toBe("You are a code reviewer.")
    expect(Array.isArray(backToResponses.input)).toBe(true)
    expect((backToResponses.input as any).length).toBe(3)
    expect(backToResponses.temperature).toBe(0.3)
    expect(backToResponses.max_tokens).toBe(500)
    expect(backToResponses.previous_response_id).toBe("resp_abc123")
    expect(backToResponses.store).toBe(true)
  })

  it("should handle cross-provider translation from Responses", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-4o",
      instructions: "You are a helpful assistant.",
      input: "Explain quantum computing",
      temperature: 0.7
    }

    // Convert to universal
    const universal = toUniversal("openai", responsesBody as any, "https://api.openai.com/v1/responses");
    
    // Change to Anthropic
    (universal as any).provider = "anthropic"
    const anthropicBody = fromUniversal("anthropic", universal) as any
    
    expect(anthropicBody.model).toBe("gpt-4o")
    expect(anthropicBody.system).toBe("You are a helpful assistant.")
    expect(anthropicBody.messages).toHaveLength(1)
    expect(anthropicBody.messages[0].role).toBe("user")
    expect(anthropicBody.messages[0].content[0].text).toBe("Explain quantum computing")
    expect(anthropicBody.temperature).toBe(0.7);
    
    // Change to Google
    (universal as any).provider = "google"
    const googleBody = fromUniversal("google", universal) as any
    
    expect(googleBody.systemInstruction.parts[0].text).toBe("You are a helpful assistant.")
    expect(googleBody.contents).toHaveLength(1)
    expect(googleBody.contents[0].parts[0].text).toBe("Explain quantum computing")
    expect(googleBody.generationConfig.temperature).toBe(0.7)
  })

  it("should preserve built-in tools through translation", () => {
    const responsesBody: OpenAIResponsesBody = {
      model: "gpt-4o",
      input: "Search for information about TypeScript",
      tools: [
        { type: "web_search_preview" },
        { type: "file_search" },
        {
          type: "function",
          function: {
            name: "saveNote",
            description: "Save a note",
            parameters: {
              type: "object",
              properties: {
                content: { type: "string" }
              }
            }
          }
        }
      ],
      tool_choice: "auto"
    }

    const universal = toUniversal("openai", responsesBody, "https://api.openai.com/v1/responses")
    
    // Function tools should be extracted
    expect(universal.tools).toHaveLength(1)
    expect(universal.tools![0].name).toBe("saveNote")
    
    // All tools should be preserved
    expect(universal.provider_params?.responses_tools).toHaveLength(3)
    expect(universal.provider_params?.responses_tool_choice).toBe("auto")
    
    // Round trip
    const backToResponses = fromUniversal("openai", universal, "https://api.openai.com/v1/responses") as OpenAIResponsesBody
    
    expect(backToResponses.tools).toHaveLength(3)
    expect(backToResponses.tools![0].type).toBe("web_search_preview")
    expect(backToResponses.tools![1].type).toBe("file_search")
    expect(backToResponses.tools![2].type).toBe("function")
    expect(backToResponses.tool_choice).toBe("auto")
  })
})
