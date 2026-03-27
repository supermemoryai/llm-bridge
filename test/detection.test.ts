import { describe, it, expect } from "vitest"
import { detectProvider } from "../src/models/detector.js"

describe("Provider Detection", () => {
  describe("URL-based detection", () => {
    it("should detect anthropic from anthropic.com", () => {
      expect(
        detectProvider("https://api.anthropic.com/v1/messages", {}),
      ).toBe("anthropic")
    })

    it("should detect google from googleapis.com", () => {
      expect(
        detectProvider(
          "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
          {},
        ),
      ).toBe("google")
    })

    it("should detect google from aiplatform.googleapis.com (Vertex AI)", () => {
      expect(
        detectProvider(
          "https://aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-pro:generateContent",
          {},
        ),
      ).toBe("google")
    })

    it("should detect anthropic from bedrock/amazonaws.com", () => {
      expect(
        detectProvider(
          "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-v2/invoke",
          {},
        ),
      ).toBe("anthropic")

      expect(
        detectProvider(
          "https://bedrock.us-west-2.amazonaws.com/v1/messages",
          {},
        ),
      ).toBe("anthropic")
    })

    it("should default to openai for unknown URLs", () => {
      expect(
        detectProvider("https://api.openai.com/v1/chat/completions", {}),
      ).toBe("openai")

      expect(
        detectProvider("https://api.together.ai/v1/chat/completions", {}),
      ).toBe("openai")

      expect(
        detectProvider("https://api.groq.com/openai/v1/chat/completions", {}),
      ).toBe("openai")

      expect(
        detectProvider("https://custom-llm.example.com/api/chat", {}),
      ).toBe("openai")
    })

    it("should detect openai-responses from /v1/responses URL", () => {
      expect(
        detectProvider("https://api.openai.com/v1/responses", {}),
      ).toBe("openai-responses")
    })

    it("should detect openai-responses from /responses URL", () => {
      expect(
        detectProvider("https://custom-proxy.com/responses", {}),
      ).toBe("openai-responses")
    })
  })

  describe("Body-based detection", () => {
    it("should detect anthropic from anthropic_version field", () => {
      const body = {
        anthropic_version: "2023-06-01",
        model: "claude-3-opus-20240229",
        max_tokens: 1000,
        messages: [{ role: "user", content: "Hello" }],
      }

      expect(
        detectProvider("https://unknown-proxy.com/api", body),
      ).toBe("anthropic")
    })

    it("should detect google from contents field", () => {
      const body = {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }],
          },
        ],
      }

      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("google")
    })

    it("should detect google from systemInstruction field", () => {
      const body = {
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

      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("google")
    })

    it("should detect openai-responses from input without messages", () => {
      const body = {
        model: "gpt-4o",
        input: [
          { role: "user", content: "Hello" },
        ],
      }

      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("openai-responses")
    })

    it("should detect openai-responses from string input without messages", () => {
      const body = {
        model: "gpt-4o",
        input: "What is the capital of France?",
      }

      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("openai-responses")
    })

    it("should detect anthropic for ambiguous body with system string + messages without contents", () => {
      // system (string) + messages + no contents → anthropic
      const body = {
        model: "claude-3-sonnet-20240229",
        system: "You are a helpful assistant",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1000,
      }

      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("anthropic")
    })

    it("should default to openai when body has messages but no anthropic/google indicators", () => {
      const body = {
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant" },
          { role: "user", content: "Hello" },
        ],
        temperature: 0.7,
      }

      // system is in messages array (not top-level string), so anthropic check doesn't trigger
      expect(
        detectProvider("https://proxy.com/api", body),
      ).toBe("openai")
    })

    it("should default to openai for empty or invalid bodies", () => {
      expect(detectProvider("https://proxy.com/api", null)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", undefined)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", "string")).toBe("openai")
      expect(detectProvider("https://proxy.com/api", 123)).toBe("openai")
      expect(detectProvider("https://proxy.com/api", {})).toBe("openai")
    })
  })

  describe("Default fallback", () => {
    it("should default to openai when no indicators match", () => {
      expect(
        detectProvider("https://api.unknown-provider.com/v1/chat", {}),
      ).toBe("openai")
    })

    it("should default to openai for a body with only model field", () => {
      expect(
        detectProvider("https://proxy.com/api", { model: "some-model" }),
      ).toBe("openai")
    })
  })
})
