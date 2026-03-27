import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models/index.js"

describe("Google (Gemini) format conversion", () => {
  describe("basic text messages", () => {
    it("should convert user text message to universal", () => {
      const body = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello, Gemini!" }],
          },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.provider).toBe("google")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content).toHaveLength(1)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[0].text).toBe("Hello, Gemini!")
    })

    it("should convert model role to assistant", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "What is 2+2?" }] },
          { role: "model", parts: [{ text: "2+2 equals 4." }] },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.messages).toHaveLength(2)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("What is 2+2?")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[1].content[0].text).toBe("2+2 equals 4.")
    })

    it("should handle multi-turn conversation", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hi" }] },
          { role: "model", parts: [{ text: "Hello!" }] },
          { role: "user", parts: [{ text: "How are you?" }] },
          { role: "model", parts: [{ text: "I'm doing well!" }] },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.messages).toHaveLength(4)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[1].role).toBe("assistant")
      expect(universal.messages[2].role).toBe("user")
      expect(universal.messages[3].role).toBe("assistant")
    })
  })

  describe("systemInstruction handling", () => {
    it("should convert systemInstruction to universal system", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant." }],
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.system).toBe("You are a helpful assistant.")
    })

    it("should join multiple systemInstruction parts", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        systemInstruction: {
          parts: [
            { text: "You are a pirate." },
            { text: "Always speak in pirate talk." },
          ],
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.system).toBe("You are a pirate. Always speak in pirate talk.")
    })
  })

  describe("inlineData (base64 images)", () => {
    it("should convert inlineData image to universal", () => {
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "iVBORw0KGgoAAAANS...",
                },
              },
              { text: "What is in this image?" },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.messages[0].content).toHaveLength(2)

      const imageContent = universal.messages[0].content[0]
      expect(imageContent.type).toBe("image")
      expect(imageContent.media?.data).toBe("iVBORw0KGgoAAAANS...")
      expect(imageContent.media?.mimeType).toBe("image/png")

      const textContent = universal.messages[0].content[1]
      expect(textContent.type).toBe("text")
      expect(textContent.text).toBe("What is in this image?")
    })
  })

  describe("functionCall parts (tool calls)", () => {
    it("should convert functionCall to universal tool_call", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "What's the weather?" }] },
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "Tokyo", unit: "celsius" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      const modelMsg = universal.messages[1]
      expect(modelMsg.role).toBe("assistant")
      expect(modelMsg.content).toHaveLength(1)

      const toolCall = modelMsg.content[0]
      expect(toolCall.type).toBe("tool_call")
      expect(toolCall.tool_call?.name).toBe("get_weather")
      expect(toolCall.tool_call?.arguments).toEqual({ location: "Tokyo", unit: "celsius" })
      expect(toolCall.tool_call?.id).toBeDefined()
    })

    it("should convert multiple functionCalls in one message", () => {
      const body = {
        contents: [
          {
            role: "model",
            parts: [
              {
                functionCall: {
                  name: "get_weather",
                  args: { location: "Tokyo" },
                },
              },
              {
                functionCall: {
                  name: "get_time",
                  args: { timezone: "Asia/Tokyo" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].tool_call?.name).toBe("get_weather")
      expect(universal.messages[0].content[1].tool_call?.name).toBe("get_time")
    })
  })

  describe("functionResponse parts (tool results)", () => {
    it("should convert functionResponse to universal tool_result", () => {
      const body = {
        contents: [
          {
            role: "user",
            parts: [
              {
                functionResponse: {
                  name: "get_weather",
                  response: { temperature: 22, condition: "sunny" },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      const toolResult = universal.messages[0].content[0]
      expect(toolResult.type).toBe("tool_result")
      expect(toolResult.tool_result?.name).toBe("get_weather")
      expect(toolResult.tool_result?.result).toEqual({ temperature: 22, condition: "sunny" })
    })
  })

  describe("functionDeclarations (tool definitions)", () => {
    it("should convert functionDeclarations to universal tools", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Get weather" }] },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get current weather for a location",
                parameters: {
                  type: "object",
                  properties: {
                    location: { type: "string", description: "City name" },
                  },
                  required: ["location"],
                },
              },
              {
                name: "get_time",
                description: "Get current time for a timezone",
                parameters: {
                  type: "object",
                  properties: {
                    timezone: { type: "string" },
                  },
                },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.tools).toHaveLength(2)
      expect(universal.tools![0].name).toBe("get_weather")
      expect(universal.tools![0].description).toBe("Get current weather for a location")
      expect(universal.tools![0].parameters).toEqual(body.tools[0].functionDeclarations[0].parameters)
      expect(universal.tools![1].name).toBe("get_time")
    })

    it("should handle tool config with function calling mode", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "greet",
                description: "Greet the user",
                parameters: { type: "object", properties: {} },
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO",
          },
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.tool_choice).toBe("auto")
    })
  })

  describe("thinkingConfig", () => {
    it("should convert thinkingConfig with thinkingBudget to universal", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Think about this." }] },
        ],
        thinkingConfig: {
          thinkingBudget: 8192,
        },
      } as any

      const universal = toUniversal("google", body)

      expect(universal.thinking).toBeDefined()
      expect(universal.thinking!.enabled).toBe(true)
      expect(universal.thinking!.budget_tokens).toBe(8192)
    })

    it("should convert thinkingConfig with thinkingLevel to universal", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Think about this." }] },
        ],
        thinkingConfig: {
          thinkingLevel: "medium",
        },
      } as any

      const universal = toUniversal("google", body)

      expect(universal.thinking).toBeDefined()
      expect(universal.thinking!.enabled).toBe(true)
      expect(universal.thinking!.effort).toBe("medium")
    })

    it("should convert thinkingConfig with both budget and level", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Complex task." }] },
        ],
        thinkingConfig: {
          thinkingBudget: 16384,
          thinkingLevel: "high",
        },
      } as any

      const universal = toUniversal("google", body)

      expect(universal.thinking!.enabled).toBe(true)
      expect(universal.thinking!.budget_tokens).toBe(16384)
      expect(universal.thinking!.effort).toBe("high")
    })
  })

  describe("thought parts", () => {
    it("should convert thought parts to universal thinking content", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Think step by step." }] },
          {
            role: "model",
            parts: [
              { thought: true, text: "Let me reason through this..." },
              { text: "Here is my answer." },
            ],
          },
        ],
      }

      const universal = toUniversal("google", body)

      const modelMsg = universal.messages[1]
      expect(modelMsg.content).toHaveLength(2)

      const thinkingPart = modelMsg.content[0]
      expect(thinkingPart.type).toBe("thinking")
      expect(thinkingPart.thinking).toBe("Let me reason through this...")

      const textPart = modelMsg.content[1]
      expect(textPart.type).toBe("text")
      expect(textPart.text).toBe("Here is my answer.")
    })
  })

  describe("generationConfig with structured output", () => {
    it("should convert responseMimeType + responseSchema to universal structured_output", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "List 3 colors" }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              colors: { type: "array", items: { type: "string" } },
            },
          },
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_schema")
      expect(universal.structured_output!.json_schema?.name).toBe("response")
      expect(universal.structured_output!.json_schema?.schema).toEqual(body.generationConfig.responseSchema)
    })

    it("should convert responseMimeType without schema to json_object", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Return JSON" }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.structured_output).toBeDefined()
      expect(universal.structured_output!.type).toBe("json_object")
    })

    it("should extract temperature, maxOutputTokens, topP from generationConfig", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
          topP: 0.95,
        },
      }

      const universal = toUniversal("google", body)

      expect(universal.temperature).toBe(0.8)
      expect(universal.max_tokens).toBe(2048)
      expect(universal.top_p).toBe(0.95)
    })
  })

  describe("round-trip: google → universal → google", () => {
    it("should round-trip basic text messages", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "Hello!" }] },
          { role: "model", parts: [{ text: "Hi there!" }] },
        ],
      }

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      // Unmodified messages should return the original
      expect(result.contents).toHaveLength(2)
    })

    it("should round-trip systemInstruction", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        systemInstruction: {
          parts: [{ text: "You are a pirate." }],
        },
      }

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      expect(result.systemInstruction).toBeDefined()
      expect(result.systemInstruction.parts).toHaveLength(1)
      expect(result.systemInstruction.parts[0].text).toBe("You are a pirate.")
    })

    it("should round-trip tools", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "Get weather" }] },
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: "get_weather",
                description: "Get weather",
                parameters: { type: "object", properties: { location: { type: "string" } } },
              },
            ],
          },
        ],
      }

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].functionDeclarations).toHaveLength(1)
      expect(result.tools[0].functionDeclarations[0].name).toBe("get_weather")
    })

    it("should round-trip thinkingConfig", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "Think" }] },
        ],
        thinkingConfig: {
          thinkingBudget: 4096,
          thinkingLevel: "high",
        },
      } as any

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      expect(result.thinkingConfig).toBeDefined()
      expect(result.thinkingConfig.thinkingBudget).toBe(4096)
      expect(result.thinkingConfig.thinkingLevel).toBe("high")
    })

    it("should round-trip generationConfig with structured output", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "JSON please" }] },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: { name: { type: "string" } },
          },
        },
      }

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      expect(result.generationConfig.responseMimeType).toBe("application/json")
      expect(result.generationConfig.responseSchema).toEqual(original.generationConfig.responseSchema)
    })

    it("should round-trip generationConfig temperature and maxOutputTokens", () => {
      const original = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          topP: 0.9,
        },
      }

      const universal = toUniversal("google", original)
      const result = fromUniversal("google", universal) as any

      expect(result.generationConfig.temperature).toBe(0.7)
      expect(result.generationConfig.maxOutputTokens).toBe(4096)
      expect(result.generationConfig.topP).toBe(0.9)
    })
  })

  describe("fromUniversal: google output", () => {
    it("should convert universal text messages to Google format", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [{ type: "text" as const, text: "Hello Gemini!" }],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
          {
            content: [{ type: "text" as const, text: "Hello!" }],
            id: "msg2",
            metadata: { provider: "google" as const },
            role: "assistant" as const,
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      expect(result.contents).toHaveLength(2)
      expect(result.contents[0].role).toBe("user")
      expect(result.contents[0].parts[0].text).toBe("Hello Gemini!")
      expect(result.contents[1].role).toBe("model")
      expect(result.contents[1].parts[0].text).toBe("Hello!")
    })

    it("should convert universal image to Google inlineData", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [
              {
                type: "image" as const,
                media: {
                  data: "base64imagedata",
                  mimeType: "image/jpeg",
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      const part = result.contents[0].parts[0]
      expect(part.inlineData).toBeDefined()
      expect(part.inlineData.data).toBe("base64imagedata")
      expect(part.inlineData.mimeType).toBe("image/jpeg")
    })

    it("should convert universal tool_call to Google functionCall", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [
              {
                type: "tool_call" as const,
                tool_call: {
                  id: "call_123",
                  name: "get_weather",
                  arguments: { location: "Paris" },
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "assistant" as const,
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      const part = result.contents[0].parts[0]
      expect(part.functionCall).toBeDefined()
      expect(part.functionCall.name).toBe("get_weather")
      expect(part.functionCall.args).toEqual({ location: "Paris" })
    })

    it("should convert universal tool_result to Google functionResponse", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [
              {
                type: "tool_result" as const,
                tool_result: {
                  tool_call_id: "call_123",
                  name: "get_weather",
                  result: { temperature: 25 },
                },
              },
            ],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      const part = result.contents[0].parts[0]
      expect(part.functionResponse).toBeDefined()
      expect(part.functionResponse.name).toBe("get_weather")
      expect(part.functionResponse.response).toEqual({ temperature: 25 })
    })

    it("should convert universal thinking content to Google thought parts", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [
              { type: "thinking" as const, thinking: "Let me think..." },
              { type: "text" as const, text: "The answer is 42." },
            ],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "assistant" as const,
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      expect(result.contents[0].parts[0]).toEqual({ thought: true, text: "Let me think..." })
      expect(result.contents[0].parts[1]).toEqual({ text: "The answer is 42." })
    })

    it("should convert universal tools to Google functionDeclarations", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [{ type: "text" as const, text: "Hello" }],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
        ],
        tools: [
          {
            name: "search",
            description: "Search the web",
            parameters: { type: "object", properties: { query: { type: "string" } } },
          },
        ],
      }

      const result = fromUniversal("google", universal as any) as any

      expect(result.tools).toHaveLength(1)
      expect(result.tools[0].functionDeclarations).toHaveLength(1)
      expect(result.tools[0].functionDeclarations[0].name).toBe("search")
      expect(result.tools[0].functionDeclarations[0].description).toBe("Search the web")
    })

    it("should write thinking config back when enabled", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [{ type: "text" as const, text: "Think" }],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
        ],
        thinking: {
          enabled: true,
          budget_tokens: 2048,
          effort: "medium" as const,
        },
      }

      const result = fromUniversal("google", universal as any) as any

      expect(result.generationConfig?.thinkingConfig).toBeDefined()
      expect(result.generationConfig.thinkingConfig.thinkingBudget).toBe(2048)
      expect(result.generationConfig.thinkingConfig.thinkingLevel).toBe("medium")
    })

    it("should write structured_output as responseMimeType/responseSchema", () => {
      const universal = {
        provider: "google" as const,
        model: "gemini-pro",
        messages: [
          {
            content: [{ type: "text" as const, text: "JSON" }],
            id: "msg1",
            metadata: { provider: "google" as const },
            role: "user" as const,
          },
        ],
        structured_output: {
          type: "json_schema" as const,
          json_schema: {
            name: "response",
            schema: { type: "object", properties: { name: { type: "string" } } },
          },
        },
      }

      const result = fromUniversal("google", universal as any) as any

      expect(result.generationConfig.responseMimeType).toBe("application/json")
      expect(result.generationConfig.responseSchema).toEqual({ type: "object", properties: { name: { type: "string" } } })
    })
  })

  describe("edge cases", () => {
    it("should handle empty contents array", () => {
      const body = {
        contents: [],
      }

      const universal = toUniversal("google", body)

      expect(universal.messages).toHaveLength(0)
    })

    it("should handle missing tools", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.tools).toBeUndefined()
    })

    it("should preserve safety settings in provider_params", () => {
      const body = {
        contents: [
          { role: "user", parts: [{ text: "Hello" }] },
        ],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        ],
      }

      const universal = toUniversal("google", body)

      expect(universal.provider_params?.safety_settings).toEqual(body.safetySettings)
    })
  })
})
