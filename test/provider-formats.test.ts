import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"
import { UniversalBody } from "../src/types/universal"
import type { AnthropicBody } from "../src/types/providers"

describe("Provider Format Conversions", () => {
  describe("OpenAI Format", () => {
    it("should convert OpenAI request to universal format", () => {
      const openaiRequest = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" }
        ],
        temperature: 0.7,
        max_tokens: 100
      }

      const universal = toUniversal("openai", openaiRequest)
      
      expect(universal.provider).toBe("openai")
      expect(universal.model).toBe("gpt-4")
      expect(universal.system).toBe("You are helpful")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("Hello")
      expect(universal.temperature).toBe(0.7)
      expect(universal.max_tokens).toBe(100)
    })

    it("should handle OpenAI multimodal content", () => {
      const openaiRequest = {
        model: "gpt-4-vision",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64,xyz" } }
            ]
          }
        ]
      }

      const universal = toUniversal("openai", openaiRequest)
      
      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[1].type).toBe("image")
    })

    it("should handle OpenAI tool calls", () => {
      const openaiRequest = {
        model: "gpt-4",
        messages: [
          {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: '{"location": "NYC"}'
                }
              }
            ]
          }
        ]
      }

      const universal = toUniversal("openai", openaiRequest)
      
      expect(universal.messages[0].tool_calls).toHaveLength(1)
      expect(universal.messages[0].tool_calls?.[0].id).toBe("call_123")
      expect(universal.messages[0].tool_calls?.[0].name).toBe("get_weather")
    })

    it("should convert universal back to OpenAI format", () => {
      const universal: UniversalBody<"openai"> = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: { provider: "openai" }
          }
        ],
        system: "You are helpful",
        temperature: 0.7,
        max_tokens: 100
      }

      const openaiRequest = fromUniversal("openai", universal)

      expect(openaiRequest.model).toBe("gpt-4")
      if ("messages" in openaiRequest) {
        expect(openaiRequest.messages).toHaveLength(2)
        expect(openaiRequest.messages[0].role).toBe("system")
        expect(openaiRequest.messages[0].content).toBe("You are helpful")
        expect(openaiRequest.messages[1].role).toBe("user")
        expect(openaiRequest.messages[1].content).toBe("Hello")
        expect(openaiRequest.temperature).toBe(0.7)
        expect(openaiRequest.max_tokens).toBe(100)
      } else {
        expect(false).toBe(true)
      }
    })

    // New: Responses API conversion test
    it("should convert Responses API request -> universal and back (preserving store/previous_response_id)", () => {
      const responsesReq = {
        model: "gpt-4o",
        instructions: "You are helpful.",
        input: [
          {
            type: "message",
            role: "user",
            content: [
              { type: "input_text", text: "Hello" },
              { type: "input_image", detail: "auto", image_url: "https://example.com/image.png" },
            ],
          },
        ],
        store: true,
        previous_response_id: "resp_123",
        include: ["reasoning.encrypted_content"],
        tools: [
          {
            type: "function",
            name: "get_weather",
            description: "Get weather",
            parameters: { type: "object", properties: { city: { type: "string" } } },
            strict: null,
          },
          { type: "web_search_preview" },
        ],
        tool_choice: "auto",
      }

      const universal = toUniversal("openai", responsesReq as any) as UniversalBody

      expect(universal.provider).toBe("openai")
      expect(universal.model).toBe("gpt-4o")
      expect(universal.system).toBe("You are helpful.")
      expect(universal.messages.length).toBe(1)
      expect(universal.messages[0].role).toBe("user")
      const textParts = universal.messages[0].content.filter(c => c.type === "text")
      const imageParts = universal.messages[0].content.filter(c => c.type === "image")
      expect(textParts.length).toBe(1)
      expect(textParts[0].text).toBe("Hello")
      expect(imageParts.length).toBe(1)
      expect(imageParts[0].media?.url).toBe("https://example.com/image.png")

      // Provider params pass-through
      expect((universal.provider_params as any)?.store).toBe(true)
      expect((universal.provider_params as any)?.previous_response_id).toBe("resp_123")

      // Back to Responses (explicitly signal Responses emission)
      const back = fromUniversal("openai", { ...universal, provider_params: { ...(universal.provider_params || {}), openai_target: "responses" } }) as any
      expect(back.model).toBe("gpt-4o")
      expect(back.instructions).toBe("You are helpful.")
      expect(back.store).toBe(true)
      expect(back.previous_response_id).toBe("resp_123")
      expect(Array.isArray(back.input)).toBe(true)
      if (Array.isArray(back.input)) {
        const msg = back.input[0]
        expect(msg.role).toBe("user")
        expect(msg.type).toBe("message")
      }
    })

    it("should convert Chat-shaped universal to Responses when target is responses and streaming unions are correct", () => {
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4o",
        messages: [
          { id: "1", role: "user", content: [{ type: "text", text: "Hi" }], metadata: { provider: "openai" } },
        ],
        system: "You are helpful.",
        stream: true,
      }

      const responses = fromUniversal(
        "openai",
        { ...universal, provider_params: { openai_target: "responses" } },
      ) as any

      expect(responses.model).toBe("gpt-4o")
      expect(responses.stream).toBe(true)
      expect(Array.isArray(responses.input)).toBe(true)
    })
  })

  describe("Anthropic Format", () => {
    it("should convert Anthropic request to universal format", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-3-sonnet-20240229",
        messages: [
          { role: "user", content: "Hello Claude" }
        ],
        system: "You are Claude",
        max_tokens: 200,
        temperature: 0.5,
        stream: true
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      
      expect(universal.provider).toBe("anthropic")
      expect(universal.model).toBe("claude-3-sonnet-20240229")
      expect(universal.system).toBe("You are Claude")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("Hello Claude")
      expect(universal.temperature).toBe(0.5)
      expect(universal.max_tokens).toBe(200)
    })

    it("should handle Anthropic multimodal content", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-3-sonnet-20240229",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              { 
                type: "image", 
                source: { 
                  type: "base64", 
                  media_type: "image/jpeg", 
                  data: "xyz" 
                } 
              }
            ]
          }
        ],
        max_tokens: 100,
        stream: true,
        system: undefined as any // explicit to satisfy union shape where system may be undefined
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      
      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[1].type).toBe("image")
    })

    it("should handle Anthropic tool use", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-3-sonnet-20240229",
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_123",
                name: "get_weather",
                input: { location: "NYC" }
              }
            ]
          }
        ],
        max_tokens: 100,
        stream: true,
        system: undefined as any
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      
      expect(universal.messages[0].content).toHaveLength(1)
      expect(universal.messages[0].content[0].type).toBe("tool_call")
      expect(universal.messages[0].content[0].tool_call?.id).toBe("toolu_123")
      expect(universal.messages[0].content[0].tool_call?.name).toBe("get_weather")
    })

    it("should convert universal back to Anthropic format", () => {
      const universal: UniversalBody = {
        provider: "anthropic",
        model: "claude-3-sonnet-20240229",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello Claude" }],
            metadata: { provider: "anthropic" }
          }
        ],
        system: "You are helpful",
        temperature: 0.5,
        max_tokens: 200
      }

      const anthropicRequest = fromUniversal("anthropic", universal)
      
      expect((anthropicRequest as any).model).toBe("claude-3-sonnet-20240229")
      expect((anthropicRequest as any).system).toBe("You are helpful")
      expect((anthropicRequest as any).messages).toHaveLength(1)
      expect((anthropicRequest as any).messages[0].role).toBe("user")
      expect((anthropicRequest as any).messages[0].content).toEqual([{ type: "text", text: "Hello Claude" }])
      expect((anthropicRequest as any).temperature).toBe(0.5)
      expect((anthropicRequest as any).max_tokens).toBe(200)
    })
  })

  describe("Google Format", () => {
    it("should convert Google request to universal format", () => {
      const googleRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello Gemini" }]
          }
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 150
        }
      }

      const universal = toUniversal("google", googleRequest)
      
      expect(universal.provider).toBe("google")
      expect(universal.model).toBe("gemini-pro")
      expect(universal.messages).toHaveLength(1)
      expect(universal.messages[0].role).toBe("user")
      expect(universal.messages[0].content[0].text).toBe("Hello Gemini")
      expect(universal.temperature).toBe(0.8)
      expect(universal.max_tokens).toBe(150)
    })

    it("should handle Google multimodal content", () => {
      const googleRequest = {
        contents: [
          {
            role: "user",
            parts: [
              { text: "What's in this image?" },
              { 
                inlineData: { 
                  mimeType: "image/jpeg", 
                  data: "xyz" 
                } 
              }
            ]
          }
        ]
      }

      const universal = toUniversal("google", googleRequest)
      
      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[1].type).toBe("image")
    })

    it("should handle Google system instruction", () => {
      const googleRequest = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }]
          }
        ],
        systemInstruction: {
          role: "system",
          parts: [{ text: "You are a helpful assistant" }]
        }
      }

      const universal = toUniversal("google", googleRequest)
      
      expect(universal.system).toBe("You are a helpful assistant")
    })

    it("should convert universal back to Google format", () => {
      const universal: UniversalBody = {
        provider: "google",
        model: "gemini-pro",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello Gemini" }],
            metadata: { provider: "google" }
          }
        ],
        system: "You are helpful",
        temperature: 0.8,
        max_tokens: 150
      }

      const googleRequest = fromUniversal("google", universal)

      if ("contents" in googleRequest) {
        expect(googleRequest.contents).toHaveLength(1)
        expect(googleRequest.contents[0].role).toBe("user")
        expect(googleRequest.contents[0].parts[0].text).toBe("Hello Gemini")
        const si = googleRequest.systemInstruction
        if (typeof si === "string") {
          expect(si).toBe("You are helpful")
        } else if (Array.isArray(si)) {
          expect(si[0]?.text).toBe("You are helpful")
        } else if (si && typeof si === "object" && "parts" in si) {
          expect((si as { parts: Array<{ text?: string }> }).parts[0].text).toBe("You are helpful")
        }
        expect(googleRequest.generationConfig?.temperature).toBe(0.8)
        expect(googleRequest.generationConfig?.maxOutputTokens).toBe(150)
      } else {
        expect(false).toBe(true)
      }
    })
  })

  describe("Cross-Provider Compatibility", () => {
    it("should handle OpenAI to Anthropic conversion", () => {
      const openaiRequest = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" }
        ],
        temperature: 0.7,
        max_tokens: 100
      }

      const universal = toUniversal("openai", openaiRequest)
      const anthropicRequest = fromUniversal("anthropic", universal)
      
      expect((anthropicRequest as any).model).toBe("gpt-4")
      expect((anthropicRequest as any).system).toBe("You are helpful")
      expect((anthropicRequest as any).messages).toHaveLength(1)
      expect((anthropicRequest as any).messages[0].role).toBe("user")
      expect((anthropicRequest as any).temperature).toBe(0.7)
      expect((anthropicRequest as any).max_tokens).toBe(100)
    })

    it("should handle Anthropic to Google conversion", () => {
      const anthropicRequest: AnthropicBody = {
        model: "claude-3-sonnet-20240229",
        messages: [
          { role: "user", content: "Hello Claude" }
        ],
        system: "You are Claude",
        max_tokens: 200,
        temperature: 0.5,
        stream: true
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const googleRequest = fromUniversal("google", universal)

      if ("contents" in googleRequest) {
        expect(googleRequest.contents).toHaveLength(1)
        expect(googleRequest.contents[0].role).toBe("user")
        expect(googleRequest.contents[0].parts[0].text).toBe("Hello Claude")
        const si = googleRequest.systemInstruction
        if (typeof si === "string") {
          expect(si).toBe("You are Claude")
        } else if (Array.isArray(si)) {
          expect(si[0]?.text).toBe("You are Claude")
        } else if (si && typeof si === "object" && "parts" in si) {
          expect((si as { parts: Array<{ text?: string }> }).parts[0].text).toBe("You are Claude")
        }
        expect(googleRequest.generationConfig?.temperature).toBe(0.5)
        expect(googleRequest.generationConfig?.maxOutputTokens).toBe(200)
      } else {
        expect(false).toBe(true)
      }
    })
  })
})