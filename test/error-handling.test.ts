import { test, expect, describe } from "vitest"
import {
  parseProviderError,
  buildUniversalError,
  translateError,
  createAuthenticationError,
  createRateLimitError,
  createModelNotFoundError,
  createContextLengthError,
  createToolError,
  isRetryableError,
  isUserError,
  isQuotaError,
} from "../src/errors"

describe("Error Handling", () => {
  describe("Provider error parsing", () => {
    test("should parse OpenAI errors correctly", () => {
      const openaiError = {
        error: {
          message: "Invalid API key provided",
          type: "invalid_request_error",
          param: null,
          code: "invalid_api_key",
        },
      }

      const universal = parseProviderError(openaiError, "openai")

      expect(universal.type).toBe("invalid_request_error")
      expect(universal.message).toBe("Invalid API key provided")
      expect(universal.code).toBe("invalid_api_key")
      expect(universal.provider).toBe("openai")
      expect(universal.httpStatus).toBe(400)
    })

    test("should parse Anthropic errors correctly", () => {
      const anthropicError = {
        type: "error",
        error: {
          type: "authentication_error",
          message: "Invalid API key",
        },
      }

      const universal = parseProviderError(anthropicError, "anthropic")

      expect(universal.type).toBe("authentication_error")
      expect(universal.message).toBe("Invalid API key")
      expect(universal.provider).toBe("anthropic")
      expect(universal.httpStatus).toBe(401)
    })

    test("should parse Google errors correctly", () => {
      const googleError = {
        error: {
          code: 400,
          message: "Invalid request format",
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: "INVALID_REQUEST",
            },
          ],
        },
      }

      const universal = parseProviderError(googleError, "google")

      expect(universal.type).toBe("invalid_argument")
      expect(universal.message).toBe("Invalid request format")
      expect(universal.code).toBe(400)
      expect(universal.provider).toBe("google")
    })

    test("should handle rate limit errors with retry-after", () => {
      const rateLimitError = {
        error: {
          message: "Rate limit exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      }

      const mockResponse = {
        status: 429,
        headers: {
          get: (name: string) => (name === "retry-after" ? "60" : null),
        },
      } as any

      const universal = parseProviderError(
        rateLimitError,
        "openai",
        mockResponse,
      )

      expect(universal.type).toBe("rate_limit_error")
      expect(universal.httpStatus).toBe(429)
      expect(universal.retryAfter).toBe(60)
    })

    test("should handle unknown errors gracefully", () => {
      const unknownError = {
        weird_structure: true,
        some_message: "Something went wrong",
      }

      const universal = parseProviderError(unknownError, "openai")

      expect(universal.type).toBe("unknown_error")
      expect(universal.provider).toBe("openai")
      expect(universal.originalError?.raw).toEqual(unknownError)
    })
  })

  describe("Universal error building", () => {
    test("should build OpenAI format errors", () => {
      const result = buildUniversalError(
        "authentication_error",
        "Invalid API key",
        "openai",
        { code: "invalid_api_key" },
      )

      expect(result.statusCode).toBe(401)
      expect(result.universal.type).toBe("authentication_error")
      expect(result.universal.message).toBe("Invalid API key")
      expect(result.universal.provider).toBe("openai")

      const body = result.body as any
      expect(body.error.type).toBe("invalid_api_key")
      expect(body.error.message).toBe("Invalid API key")
    })

    test("should build Anthropic format errors", () => {
      const result = buildUniversalError(
        "rate_limit_error",
        "Rate limit exceeded",
        "anthropic",
        { retryAfter: 30 },
      )

      expect(result.statusCode).toBe(429)
      expect(result.universal.retryAfter).toBe(30)

      const body = result.body as any
      expect(body.type).toBe("error")
      expect(body.error.type).toBe("rate_limit_error")
      expect(body.error.message).toBe("Rate limit exceeded")
    })

    test("should build Google format errors", () => {
      const result = buildUniversalError(
        "invalid_argument",
        "Invalid request parameters",
        "google",
      )

      expect(result.statusCode).toBe(400)

      const body = result.body as any
      expect(body.error.code).toBe(400)
      expect(body.error.message).toBe("Invalid request parameters")
      expect(body.error.status).toBe("INVALID_ARGUMENT")
      expect(body.error.details[0].reason).toBe("INVALID_REQUEST")
    })
  })

  describe("Error translation between providers", () => {
    test("should translate OpenAI error to Anthropic format", () => {
      const openaiError = {
        type: "authentication_error" as const,
        message: "Invalid API key",
        code: "invalid_api_key",
        provider: "openai" as const,
        httpStatus: 401,
        timestamp: Date.now(),
      }

      const result = translateError(openaiError, "anthropic")

      expect(result.statusCode).toBe(401)
      const body = result.body as any
      expect(body.type).toBe("error")
      expect(body.error.type).toBe("authentication_error")
      expect(body.error.message).toBe("Invalid API key")
    })

    test("should translate between all provider formats", () => {
      const universalError = {
        type: "model_not_found" as const,
        message: "Model not found",
        provider: "openai" as const,
        httpStatus: 404,
        timestamp: Date.now(),
      }

      // Test all combinations
      const openaiFormat = translateError(universalError, "openai")
      const anthropicFormat = translateError(universalError, "anthropic")
      const googleFormat = translateError(universalError, "google")

      expect(openaiFormat.statusCode).toBe(404)
      expect(anthropicFormat.statusCode).toBe(404)
      expect(googleFormat.statusCode).toBe(404)
    })
  })

  describe("Convenience error creators", () => {
    test("should create authentication errors", () => {
      const result = createAuthenticationError("openai", "Invalid key")

      expect(result.universal.type).toBe("authentication_error")
      expect(result.universal.message).toBe("Invalid key")
      expect(result.universal.provider).toBe("openai")
      expect(result.statusCode).toBe(401)
    })

    test("should create rate limit errors with retry-after", () => {
      const result = createRateLimitError("anthropic", "Too many requests", 120)

      expect(result.universal.type).toBe("rate_limit_error")
      expect(result.universal.retryAfter).toBe(120)
      expect(result.statusCode).toBe(429)
    })

    test("should create model not found errors", () => {
      const result = createModelNotFoundError("google", "gpt-5-turbo")

      expect(result.universal.type).toBe("model_not_found")
      expect(result.universal.message).toContain("gpt-5-turbo")
      expect(result.universal.details?.modelName).toBe("gpt-5-turbo")
      expect(result.statusCode).toBe(404)
    })

    test("should create context length errors", () => {
      const result = createContextLengthError("openai", 150000, 128000)

      expect(result.universal.type).toBe("context_length_exceeded")
      expect(result.universal.message).toContain("150000")
      expect(result.universal.message).toContain("128000")
      expect(result.universal.details?.tokenCount).toBe(150000)
      expect(result.universal.details?.maxTokens).toBe(128000)
      expect(result.universal.usage?.totalTokens).toBe(150000)
    })

    test("should create tool errors", () => {
      const result = createToolError(
        "anthropic",
        "weather_api",
        "Connection timeout",
      )

      expect(result.universal.type).toBe("tool_error")
      expect(result.universal.toolName).toBe("weather_api")
      expect(result.universal.message).toContain("weather_api")
      expect(result.universal.message).toContain("Connection timeout")
    })
  })

  describe("Error classification", () => {
    test("should identify retryable errors", () => {
      const retryableErrors = [
        {
          type: "rate_limit_error",
          provider: "openai",
          httpStatus: 429,
          message: "Rate limited",
          timestamp: Date.now(),
        },
        {
          type: "api_error",
          provider: "anthropic",
          httpStatus: 500,
          message: "Server error",
          timestamp: Date.now(),
        },
        {
          type: "model_overloaded",
          provider: "google",
          httpStatus: 503,
          message: "Model busy",
          timestamp: Date.now(),
        },
        {
          type: "unavailable",
          provider: "openai",
          httpStatus: 503,
          message: "Service unavailable",
          timestamp: Date.now(),
        },
        {
          type: "deadline_exceeded",
          provider: "google",
          httpStatus: 504,
          message: "Timeout",
          timestamp: Date.now(),
        },
      ] as const

      retryableErrors.forEach((error) => {
        expect(isRetryableError(error)).toBe(true)
      })
    })

    test("should identify user errors", () => {
      const userErrors = [
        {
          type: "invalid_request_error",
          provider: "openai",
          httpStatus: 400,
          message: "Bad request",
          timestamp: Date.now(),
        },
        {
          type: "authentication_error",
          provider: "anthropic",
          httpStatus: 401,
          message: "Auth failed",
          timestamp: Date.now(),
        },
        {
          type: "context_length_exceeded",
          provider: "google",
          httpStatus: 400,
          message: "Too long",
          timestamp: Date.now(),
        },
        {
          type: "content_policy_violation",
          provider: "openai",
          httpStatus: 400,
          message: "Policy violation",
          timestamp: Date.now(),
        },
      ] as const

      userErrors.forEach((error) => {
        expect(isUserError(error)).toBe(true)
        expect(isRetryableError(error)).toBe(false)
      })
    })

    test("should identify quota errors", () => {
      const quotaErrors = [
        {
          type: "rate_limit_error",
          provider: "openai",
          httpStatus: 429,
          message: "Rate limited",
          timestamp: Date.now(),
        },
        {
          type: "insufficient_quota",
          provider: "anthropic",
          httpStatus: 429,
          message: "Quota exceeded",
          timestamp: Date.now(),
        },
        {
          type: "token_limit_exceeded",
          provider: "google",
          httpStatus: 429,
          message: "Token limit",
          timestamp: Date.now(),
        },
        {
          type: "payment_required",
          provider: "openai",
          httpStatus: 402,
          message: "Payment needed",
          timestamp: Date.now(),
        },
      ] as const

      quotaErrors.forEach((error) => {
        expect(isQuotaError(error)).toBe(true)
      })
    })
  })

  describe("Real-world error scenarios", () => {
    test("should handle API key rotation scenario", () => {
      const expiredKeyError = {
        error: {
          message: "You didn't provide an API key",
          type: "invalid_request_error",
          code: "invalid_api_key",
        },
      }

      const universal = parseProviderError(expiredKeyError, "openai")
      expect(universal.type).toBe("invalid_request_error")
      expect(isUserError(universal)).toBe(true)
      expect(isRetryableError(universal)).toBe(false)

      // Convert to different provider for fallback
      const anthropicError = translateError(universal, "anthropic")
      expect(anthropicError.statusCode).toBe(400)
    })

    test("should handle model capacity issues", () => {
      const overloadedError = {
        error: {
          message: "The model is currently overloaded with other requests",
          type: "overloaded_error",
          code: "model_overloaded",
        },
      }

      const universal = parseProviderError(overloadedError, "anthropic")
      expect(universal.type).toBe("model_overloaded")
      expect(isRetryableError(universal)).toBe(true)
      expect(isUserError(universal)).toBe(false)
    })

    test("should handle context window exceeded", () => {
      const contextError = createContextLengthError("openai", 200000, 128000)

      expect(contextError.universal.type).toBe("context_length_exceeded")
      expect(isUserError(contextError.universal)).toBe(true)
      expect(isRetryableError(contextError.universal)).toBe(false)

      // Should provide actionable information
      expect(contextError.universal.details?.tokenCount).toBe(200000)
      expect(contextError.universal.details?.maxTokens).toBe(128000)
    })
  })
})
