import { describe, it, expect } from "vitest"
import { handleUniversalRequest } from "../src/handler"
import { UniversalBody } from "../src/types/universal"

// Mock fetch globally
global.fetch = async () => {
  return new Response(JSON.stringify({ 
    choices: [{ message: { content: "Test response" } }] 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe("handleUniversalRequest", () => {
  it("should handle a complete OpenAI request flow", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request,
      contextModified: false,
    })

    const result = await handleUniversalRequest(
      "https://api.openai.com/v1/chat/completions",
      { 
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }] 
      },
      { Authorization: "Bearer token" },
      "POST",
      mockEditFunction,
      { requestId: "test-req-id", enableObservability: true }
    )

    expect(result.response).toBeDefined()
    expect(result.observabilityData).toBeDefined()
    expect(result.observabilityData?.provider).toBe("openai")
    expect(result.observabilityData?.model).toBe("gpt-4")
    expect(result.observabilityData?.requestId).toBe("test-req-id")
  })

  it("should handle Anthropic request", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request,
      contextModified: false,
    })

    const result = await handleUniversalRequest(
      "https://api.anthropic.com/v1/messages",
      { 
        model: "claude-3-sonnet-20240229",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 100
      },
      { "x-api-key": "token" },
      "POST",
      mockEditFunction
    )

    expect(result.response).toBeDefined()
    expect(result.observabilityData?.provider).toBe("anthropic")
    expect(result.observabilityData?.model).toBe("claude-3-sonnet-20240229")
  })

  it("should handle Google request", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request,
      contextModified: false,
    })

    const result = await handleUniversalRequest(
      "https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent",
      { 
        contents: [{ parts: [{ text: "Hello" }] }]
      },
      { "x-goog-api-key": "token" },
      "POST",
      mockEditFunction
    )

    expect(result.response).toBeDefined()
    expect(result.observabilityData?.provider).toBe("google")
    expect(result.observabilityData?.model).toBe("gemini-pro")
  })

  it("should generate request ID when not provided", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request,
      contextModified: false,
    })

    const result = await handleUniversalRequest(
      "https://api.openai.com/v1/chat/completions",
      { 
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }] 
      },
      { Authorization: "Bearer token" },
      "POST",
      mockEditFunction
    )

    expect(result.observabilityData?.requestId).toMatch(/^req_\d+_[a-z0-9]+$/)
  })

  it("should skip observability when disabled", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request,
      contextModified: false,
    })

    const result = await handleUniversalRequest(
      "https://api.openai.com/v1/chat/completions",
      { 
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }] 
      },
      { Authorization: "Bearer token" },
      "POST",
      mockEditFunction,
      { enableObservability: false }
    )

    expect(result.response).toBeDefined()
    expect(result.observabilityData).toBeUndefined()
  })

  it("should handle context modification", async () => {
    const mockEditFunction = async (request: UniversalBody) => ({
      request: {
        ...request,
        system: "Modified system prompt"
      },
      contextModified: true,
    })

    const result = await handleUniversalRequest(
      "https://api.openai.com/v1/chat/completions",
      { 
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }] 
      },
      { Authorization: "Bearer token" },
      "POST",
      mockEditFunction
    )

    expect(result.observabilityData?.contextModified).toBe(true)
  })
})