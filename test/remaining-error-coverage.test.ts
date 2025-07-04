import { describe, it, expect } from "vitest"
import { parseOpenAIError } from "../src/errors/parser"
import { 
  createAuthenticationError,
  createRateLimitError,
  createModelNotFoundError,
  createContextLengthError,
  createToolError,
  createContentFilterError
} from "../src/errors/utils"

describe("Error Parser Coverage", () => {
  describe("parseOpenAIError", () => {
    it("should parse basic OpenAI error", () => {
      const openaiError = {
        error: {
          type: "invalid_request_error",
          message: "Test error message",
          code: "test_code",
          param: "test_param"
        }
      }

      const result = parseOpenAIError(openaiError)
      
      expect(result.type).toBe("invalid_request_error")
      expect(result.message).toBe("Test error message")
      expect(result.provider).toBe("openai")
      expect(result.details?.param).toBe("test_param")
    })

    it("should handle error with response", () => {
      const openaiError = {
        error: {
          type: "rate_limit_error",
          message: "Rate limit exceeded"
        }
      }

      const response = new Response("", {
        status: 429,
        headers: { "retry-after": "60" }
      })

      const result = parseOpenAIError(openaiError, response)
      
      expect(result.type).toBe("rate_limit_error")
      expect(result.httpStatus).toBe(429)
      expect(result.retryAfter).toBe(60)
    })

    it("should handle unknown error types", () => {
      const openaiError = {
        error: {
          type: "unknown_error_type",
          message: "Unknown error"
        }
      }

      const result = parseOpenAIError(openaiError)
      
      expect(result.type).toBe("unknown_error")
      expect(result.message).toBe("Unknown error")
    })

    it("should handle error without nested error object", () => {
      const openaiError = {
        type: "api_error",
        message: "Direct error message"
      }

      const result = parseOpenAIError(openaiError)
      
      expect(result.type).toBe("api_error")
      expect(result.message).toBe("Direct error message")
    })

    it("should handle all OpenAI error type mappings", () => {
      const errorTypes = [
        "authentication_error",
        "permission_error", 
        "not_found_error",
        "insufficient_quota",
        "context_length_exceeded",
        "content_filter",
        "model_not_found"
      ]

      for (const errorType of errorTypes) {
        const openaiError = {
          error: {
            type: errorType,
            message: `Test ${errorType}`
          }
        }

        const result = parseOpenAIError(openaiError)
        expect(result.type).toBeDefined()
        expect(result.provider).toBe("openai")
      }
    })

    it("should handle error without message", () => {
      const openaiError = {
        error: {
          type: "api_error"
        }
      }

      const result = parseOpenAIError(openaiError)
      
      expect(result.message).toBe("Unknown OpenAI error")
    })

    it("should handle invalid retry-after header", () => {
      const openaiError = {
        error: {
          type: "rate_limit_error",
          message: "Rate limit exceeded"
        }
      }

      const response = new Response("", {
        status: 429,
        headers: { "retry-after": "invalid" }
      })

      const result = parseOpenAIError(openaiError, response)
      
      expect(result.retryAfter).toBeNaN()
    })
  })
})

describe("Error Utils Coverage", () => {
  describe("createAuthenticationError", () => {
    it("should create authentication error with default message", () => {
      const result = createAuthenticationError("openai")
      
      expect(result.universal.type).toBe("authentication_error")
      expect(result.universal.message).toBe("Invalid API key")
      expect(result.universal.provider).toBe("openai")
      expect(result.statusCode).toBeDefined()
      expect(result.body).toBeDefined()
    })

    it("should create authentication error with custom message", () => {
      const result = createAuthenticationError("anthropic", "Custom auth error")
      
      expect(result.universal.type).toBe("authentication_error")
      expect(result.universal.message).toBe("Custom auth error")
      expect(result.universal.provider).toBe("anthropic")
    })
  })

  describe("createRateLimitError", () => {
    it("should create rate limit error with default message", () => {
      const result = createRateLimitError("openai")
      
      expect(result.universal.type).toBe("rate_limit_error")
      expect(result.universal.message).toBe("Rate limit exceeded")
      expect(result.universal.provider).toBe("openai")
    })

    it("should create rate limit error with retry after", () => {
      const result = createRateLimitError("google", "Custom rate limit", 120)
      
      expect(result.universal.type).toBe("rate_limit_error")
      expect(result.universal.message).toBe("Custom rate limit")
      expect(result.universal.provider).toBe("google")
      expect(result.universal.retryAfter).toBe(120)
    })
  })

  describe("createModelNotFoundError", () => {
    it("should create model not found error", () => {
      const result = createModelNotFoundError("openai", "gpt-5")
      
      expect(result.universal.type).toBe("model_not_found")
      expect(result.universal.message).toBe("Model 'gpt-5' not found")
      expect(result.universal.provider).toBe("openai")
      expect(result.universal.details?.modelName).toBe("gpt-5")
    })
  })

  describe("createContextLengthError", () => {
    it("should create context length error", () => {
      const result = createContextLengthError("anthropic", 10000, 8192)
      
      expect(result.universal.type).toBe("context_length_exceeded")
      expect(result.universal.message).toBe("Token count 10000 exceeds maximum 8192")
      expect(result.universal.provider).toBe("anthropic")
      expect(result.universal.details?.tokenCount).toBe(10000)
      expect(result.universal.details?.maxTokens).toBe(8192)
      expect(result.universal.usage?.totalTokens).toBe(10000)
    })
  })

  describe("createToolError", () => {
    it("should create tool error", () => {
      const result = createToolError("google", "weather_tool", "API unavailable")
      
      expect(result.universal.type).toBe("tool_error")
      expect(result.universal.message).toBe("Tool 'weather_tool' error: API unavailable")
      expect(result.universal.provider).toBe("google")
      expect(result.universal.details?.toolName).toBe("weather_tool")
    })
  })

  describe("createContentFilterError", () => {
    it("should create content filter error with default message", () => {
      const result = createContentFilterError("openai")
      
      expect(result.universal.type).toBe("content_policy_violation")
      expect(result.universal.message).toBe("Content policy violation")
      expect(result.universal.provider).toBe("openai")
    })

    it("should create content filter error with custom message", () => {
      const result = createContentFilterError("anthropic", "Custom content violation")
      
      expect(result.universal.type).toBe("content_policy_violation")
      expect(result.universal.message).toBe("Custom content violation")
      expect(result.universal.provider).toBe("anthropic")
    })
  })
})