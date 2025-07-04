import { ProviderType } from "../types/providers"
import { ERROR_TYPE_TO_HTTP_STATUS } from "./constants"
import { UniversalError, UniversalErrorType } from "./types"

export function parseOpenAIError(
  error: unknown,
  originalResponse?: Response,
): UniversalError {
  const errorObj = error as any
  const openaiError = errorObj?.error || errorObj

  // Map OpenAI error types to universal types
  const typeMap: Record<string, UniversalErrorType> = {
    invalid_request_error: "invalid_request_error",
    authentication_error: "authentication_error",
    permission_error: "permission_error",
    not_found_error: "not_found_error",
    rate_limit_error: "rate_limit_error",
    api_error: "api_error",
    insufficient_quota: "insufficient_quota",
    context_length_exceeded: "context_length_exceeded",
    content_filter: "content_filter_error",
    model_not_found: "model_not_found",
  }

  const universalType = typeMap[openaiError.type] || "unknown_error"

  // Extract retry-after from response headers
  let retryAfter: number | undefined
  if (originalResponse?.headers) {
    const retryAfterHeader = originalResponse.headers.get("retry-after")
    if (retryAfterHeader) {
      retryAfter = parseInt(retryAfterHeader, 10)
    }
  }

  return {
    type: universalType,
    message: openaiError.message || "Unknown OpenAI error",
    code: openaiError.code,
    provider: "openai",
    httpStatus:
      originalResponse?.status || ERROR_TYPE_TO_HTTP_STATUS[universalType],
    retryAfter,
    details: {
      param: openaiError.param,
      openaiType: openaiError.type,
    },
    originalError: {
      provider: "openai",
      raw: error,
    },
  }
}

export function parseAnthropicError(
  error: unknown,
  originalResponse?: Response,
): UniversalError {
  const errorObj = error as any
  const anthropicError = errorObj?.error || errorObj

  // Map Anthropic error types to universal types
  const typeMap: Record<string, UniversalErrorType> = {
    invalid_request_error: "invalid_request_error",
    authentication_error: "authentication_error",
    permission_error: "permission_error",
    not_found_error: "not_found_error",
    rate_limit_error: "rate_limit_error",
    api_error: "api_error",
    overloaded_error: "model_overloaded",
  }

  const universalType = typeMap[anthropicError.type] || "unknown_error"

  return {
    type: universalType,
    message: anthropicError.message || "Unknown Anthropic error",
    provider: "anthropic",
    httpStatus:
      originalResponse?.status || ERROR_TYPE_TO_HTTP_STATUS[universalType],
    details: {
      anthropicType: anthropicError.type,
    },
    originalError: {
      provider: "anthropic",
      raw: error,
    },
  }
}

export function parseGoogleError(
  error: unknown,
  originalResponse?: Response,
): UniversalError {
  const errorObj = error as any
  const googleError = errorObj?.error || errorObj

  // Map Google error status to universal types
  const statusMap: Record<string, UniversalErrorType> = {
    INVALID_ARGUMENT: "invalid_argument",
    UNAUTHENTICATED: "authentication_error",
    PERMISSION_DENIED: "permission_error",
    NOT_FOUND: "not_found_error",
    RESOURCE_EXHAUSTED: "rate_limit_error",
    INTERNAL: "api_error",
    UNAVAILABLE: "unavailable",
    DEADLINE_EXCEEDED: "deadline_exceeded",
  }

  const universalType = statusMap[googleError.status] || "unknown_error"

  return {
    type: universalType,
    message: googleError.message || "Unknown Google error",
    code: googleError.code,
    provider: "google",
    httpStatus:
      originalResponse?.status ||
      googleError.code ||
      ERROR_TYPE_TO_HTTP_STATUS[universalType],
    details: {
      status: googleError.status,
      details: googleError.details,
    },
    originalError: {
      provider: "google",
      raw: error,
    },
  }
}

// Generic error parser that auto-detects provider
export function parseProviderError(
  error: unknown,
  provider: ProviderType,
  originalResponse?: Response,
): UniversalError {
  switch (provider) {
    case "openai":
      return parseOpenAIError(error, originalResponse)
    case "anthropic":
      return parseAnthropicError(error, originalResponse)
    case "google":
      return parseGoogleError(error, originalResponse)
    default:
      return {
        type: "unknown_error",
        message: "Unknown provider error",
        provider,
        httpStatus: 500,
        originalError: { provider, raw: error },
      }
  }
}
