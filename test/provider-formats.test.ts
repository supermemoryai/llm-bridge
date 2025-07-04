import { describe, it, expect } from "vitest"
import { toUniversal, fromUniversal } from "../src/models"
import { UniversalBody } from "../src/types/universal"

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
      const universal: UniversalBody = {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hello" }],
            metadata: {}
          }
        ],
        system: "You are helpful",
        temperature: 0.7,
        max_tokens: 100
      }

      const openaiRequest = fromUniversal("openai", universal)
      
      expect(openaiRequest.model).toBe("gpt-4")
      expect(openaiRequest.messages).toHaveLength(2) // system + user
      expect(openaiRequest.messages[0].role).toBe("system")
      expect(openaiRequest.messages[0].content).toBe("You are helpful")
      expect(openaiRequest.messages[1].role).toBe("user")
      expect(openaiRequest.messages[1].content).toBe("Hello")
      expect(openaiRequest.temperature).toBe(0.7)
      expect(openaiRequest.max_tokens).toBe(100)
    })
  })

  describe("Anthropic Format", () => {
    it("should convert Anthropic request to universal format", () => {
      const anthropicRequest = {
        model: "claude-3-sonnet-20240229",
        messages: [
          { role: "user", content: "Hello Claude" }
        ],
        system: "You are Claude",
        max_tokens: 200,
        temperature: 0.5
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
      const anthropicRequest = {
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
        max_tokens: 100
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      
      expect(universal.messages[0].content).toHaveLength(2)
      expect(universal.messages[0].content[0].type).toBe("text")
      expect(universal.messages[0].content[1].type).toBe("image")
    })

    it("should handle Anthropic tool use", () => {
      const anthropicRequest = {
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
        max_tokens: 100
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
            metadata: {}
          }
        ],
        system: "You are helpful",
        temperature: 0.5,
        max_tokens: 200
      }

      const anthropicRequest = fromUniversal("anthropic", universal)
      
      expect(anthropicRequest.model).toBe("claude-3-sonnet-20240229")
      expect(anthropicRequest.system).toBe("You are helpful")
      expect(anthropicRequest.messages).toHaveLength(1)
      expect(anthropicRequest.messages[0].role).toBe("user")
      expect(anthropicRequest.messages[0].content).toEqual([{ type: "text", text: "Hello Claude" }])
      expect(anthropicRequest.temperature).toBe(0.5)
      expect(anthropicRequest.max_tokens).toBe(200)
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
            metadata: {}
          }
        ],
        system: "You are helpful",
        temperature: 0.8,
        max_tokens: 150
      }

      const googleRequest = fromUniversal("google", universal)
      
      expect(googleRequest.contents).toHaveLength(1)
      expect(googleRequest.contents[0].role).toBe("user")
      expect(googleRequest.contents[0].parts[0].text).toBe("Hello Gemini")
      expect(googleRequest.systemInstruction?.parts[0].text).toBe("You are helpful")
      expect(googleRequest.generationConfig?.temperature).toBe(0.8)
      expect(googleRequest.generationConfig?.maxOutputTokens).toBe(150)
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
      
      expect(anthropicRequest.model).toBe("gpt-4")
      expect(anthropicRequest.system).toBe("You are helpful")
      expect(anthropicRequest.messages).toHaveLength(1)
      expect(anthropicRequest.messages[0].role).toBe("user")
      expect(anthropicRequest.temperature).toBe(0.7)
      expect(anthropicRequest.max_tokens).toBe(100)
    })

    it("should handle Anthropic to Google conversion", () => {
      const anthropicRequest = {
        model: "claude-3-sonnet-20240229",
        messages: [
          { role: "user", content: "Hello Claude" }
        ],
        system: "You are Claude",
        max_tokens: 200,
        temperature: 0.5
      }

      const universal = toUniversal("anthropic", anthropicRequest)
      const googleRequest = fromUniversal("google", universal)
      
      expect(googleRequest.contents).toHaveLength(1)
      expect(googleRequest.contents[0].role).toBe("user")
      expect(googleRequest.contents[0].parts[0].text).toBe("Hello Claude")
      expect(googleRequest.systemInstruction?.parts[0].text).toBe("You are Claude")
      expect(googleRequest.generationConfig?.temperature).toBe(0.5)
      expect(googleRequest.generationConfig?.maxOutputTokens).toBe(200)
    })
  })
})