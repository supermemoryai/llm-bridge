import { test, expect, describe } from "vitest"
import { detectProvider } from "../src/models/detector"

describe("Provider Detection", () => {
  describe("URL-based detection", () => {
    test("should detect OpenAI from various OpenAI URLs", () => {
      expect(
        detectProvider("https://api.openai.com/v1/chat/completions", {}),
      ).toBe("openai")
      expect(detectProvider("https://api.openai.com/v1/completions", {})).toBe(
        "openai",
      )
    })

    test("should detect Anthropic from Claude URLs", () => {
      expect(detectProvider("https://api.anthropic.com/v1/messages", {})).toBe(
        "anthropic",
      )
      expect(detectProvider("https://claude.ai/api/v1/messages", {})).toBe(
        "anthropic",
      )
    })

    test("should detect Google from various Google URLs", () => {
      expect(
        detectProvider(
          "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
          {},
        ),
      ).toBe("google")
      expect(
        detectProvider(
          "https://aiplatform.googleapis.com/v1/projects/test/locations/us-central1/publishers/google/models/gemini-pro:generateContent",
          {},
        ),
      ).toBe("google")
      expect(
        detectProvider(
          "https://googleapis.com/ai/v1/models/gemini:generate",
          {},
        ),
      ).toBe("google")
    })

    test("should detect OpenAI-compatible providers", () => {
      expect(
        detectProvider("https://api.together.ai/v1/chat/completions", {}),
      ).toBe("openai")
      expect(
        detectProvider("https://api.groq.com/openai/v1/chat/completions", {}),
      ).toBe("openai")
      expect(
        detectProvider(
          "https://api.fireworks.ai/inference/v1/chat/completions",
          {},
        ),
      ).toBe("openai")
      expect(
        detectProvider("https://openrouter.ai/api/v1/chat/completions", {}),
      ).toBe("openai")
      expect(
        detectProvider("https://api.perplexity.ai/chat/completions", {}),
      ).toBe("openai")
    })

    test("should default to OpenAI for unknown providers", () => {
      expect(
        detectProvider("https://api.unknown-provider.com/v1/chat", {}),
      ).toBe("openai")
      expect(
        detectProvider("https://custom-llm-service.com/api/chat", {}),
      ).toBe("openai")
    })
  })

  describe("Body-based detection fallback", () => {
    test("should detect Anthropic from body structure", () => {
      const anthropicBody = {
        anthropic_version: "2023-06-01",
        model: "claude-3-opus-20240229",
        max_tokens: 1000,
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Hello" }],
      }
      expect(
        detectProvider("https://unknown-proxy.com/api", anthropicBody),
      ).toBe("anthropic")
    })

    test("should detect Anthropic from system + messages structure", () => {
      const anthropicBody = {
        model: "claude-3-sonnet-20240229",
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1000,
      }
      expect(detectProvider("https://proxy.com/api", anthropicBody)).toBe(
        "anthropic",
      )
    })

    test("should detect Google from contents structure", () => {
      const googleBody = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
        },
      }
      expect(detectProvider("https://proxy.com/api", googleBody)).toBe("google")
    })

    test("should detect Google from systemInstruction", () => {
      const googleBody = {
        model: "gemini-1.5-pro",
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant" }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
        ],
      }
      expect(detectProvider("https://proxy.com/api", googleBody)).toBe("google")
    })

    test("should detect Google from tool structure", () => {
      const googleBody = {
        model: "gemini-1.5-pro",
        contents: [{ role: "user", parts: [{ text: "What's the weather?" }] }],
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
      expect(detectProvider("https://proxy.com/api", googleBody)).toBe("google")
    })

    test("should default to OpenAI for ambiguous bodies", () => {
      const openaiBody = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ],
        temperature: 0.7,
      }
      expect(detectProvider("https://proxy.com/api", openaiBody)).toBe("openai")
    })

    test("should handle empty or invalid bodies", () => {
      expect(detectProvider("https://proxy.com/api", null)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", undefined)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", "string")).toBe("openai")
      expect(detectProvider("https://proxy.com/api", 123)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", {})).toBe("openai")
    })
  })

  describe("URL parsing edge cases", () => {
    test("should handle URLs with complex paths", () => {
      expect(
        detectProvider(
          "https://api.openai.com/v1/organizations/org-123/chat/completions",
          {},
        ),
      ).toBe("openai")
      expect(
        detectProvider(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=abc",
          {},
        ),
      ).toBe("google")
    })

    test("should handle URLs with query parameters", () => {
      expect(
        detectProvider(
          "https://api.anthropic.com/v1/messages?version=2023-06-01",
          {},
        ),
      ).toBe("anthropic")
      expect(
        detectProvider(
          "https://api.openai.com/v1/chat/completions?user=test",
          {},
        ),
      ).toBe("openai")
    })

    test("should handle Azure OpenAI URLs", () => {
      expect(
        detectProvider(
          "https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions",
          {},
        ),
      ).toBe("openai")
      expect(
        detectProvider(
          "https://westus.api.cognitive.microsoft.com/openai/deployments/gpt-35-turbo/chat/completions",
          {},
        ),
      ).toBe("openai")
    })

    test("should be case insensitive", () => {
      expect(
        detectProvider("https://API.OPENAI.COM/v1/chat/completions", {}),
      ).toBe("openai")
      expect(detectProvider("https://Api.Anthropic.Com/v1/messages", {})).toBe(
        "anthropic",
      )
      expect(
        detectProvider(
          "https://GENERATIVELANGUAGE.GOOGLEAPIS.COM/v1/models/gemini:generate",
          {},
        ),
      ).toBe("google")
    })
  })
})
