import { OpenAIError } from "openai"
import type { ProviderType } from "../types/providers"
import type { GeminiError, UniversalError, UniversalErrorType } from "./types"
import { AnthropicError } from "@anthropic-ai/sdk"
import { ERROR_TYPE_TO_HTTP_STATUS } from "./constants"

function getProviderErrorType(
  errorType: UniversalErrorType,
  provider: ProviderType,
): string {
  if (provider === "openai") {
    const typeMap: Partial<Record<UniversalErrorType, string>> = {
      rate_limit_error: "insufficient_quota",
      authentication_error: "invalid_api_key",
      permission_error: "permission_denied",
      context_length_exceeded: "context_length_exceeded",
      content_filter_error: "content_filter",
      model_not_found: "model_not_found",
      insufficient_quota: "insufficient_quota",
    }
    return typeMap[errorType] || errorType
  }

  if (provider === "google") {
    const statusMap: Partial<Record<UniversalErrorType, string>> = {
      invalid_request_error: "INVALID_ARGUMENT",
      invalid_argument: "INVALID_ARGUMENT",
      authentication_error: "UNAUTHENTICATED",
      permission_error: "PERMISSION_DENIED",
      not_found_error: "NOT_FOUND",
      rate_limit_error: "RESOURCE_EXHAUSTED",
      api_error: "INTERNAL",
      unavailable: "UNAVAILABLE",
      deadline_exceeded: "DEADLINE_EXCEEDED",
    }
    return statusMap[errorType] || "INVALID_ARGUMENT"
  }

  // Anthropic uses error types mostly as-is
  return errorType
}

function getGoogleReason(errorType: UniversalErrorType): string {
  const reasonMap: Partial<Record<UniversalErrorType, string>> = {
    authentication_error: "API_KEY_INVALID",
    rate_limit_error: "RATE_LIMIT_EXCEEDED",
    permission_error: "ACCESS_DENIED",
    invalid_request_error: "INVALID_REQUEST",
    invalid_argument: "INVALID_REQUEST",
    model_not_found: "MODEL_NOT_FOUND",
    context_length_exceeded: "CONTEXT_LENGTH_EXCEEDED",
  }
  return reasonMap[errorType] || "UNKNOWN_ERROR"
}

export function buildUniversalError(
  errorType: UniversalErrorType,
  message: string,
  provider: ProviderType,
  options: {
    code?: string | number
    details?: Record<string, unknown>
    toolName?: string
    functionName?: string
    usage?: UniversalError["usage"]
    retryAfter?: number
  } = {},
): {
  statusCode: number
  body: OpenAIError | GeminiError | AnthropicError
  universal: UniversalError
} {
  const httpStatus = ERROR_TYPE_TO_HTTP_STATUS[errorType] || 500
  const statusCode = httpStatus as number

  // Create the universal error
  const universal: UniversalError = {
    type: errorType,
    message,
    code: options.code,
    provider,
    httpStatus,
    details: options.details,
    toolName: options.toolName,
    functionName: options.functionName,
    usage: options.usage,
    retryAfter: options.retryAfter,
    timestamp: Date.now(),
  }

  // Build provider-specific error format
  let body: OpenAIError | GeminiError | AnthropicError

  switch (provider) {
    case "openai":
      body = {
        error: {
          code:
            options.code?.toString() ||
            getProviderErrorType(errorType, provider),
          message,
          param: null,
          type: getProviderErrorType(errorType, provider),
        },
      } as unknown as OpenAIError
      break

    case "google":
      body = {
        error: {
          code: httpStatus,
          message,
          status: getProviderErrorType(errorType, provider),
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.ErrorInfo",
              reason: getGoogleReason(errorType),
            },
          ],
        },
      } as GeminiError
      break

    case "anthropic":
      body = {
        type: "error",
        error: {
          type: getProviderErrorType(errorType, provider),
          message,
        },
      } as unknown as AnthropicError
      break

    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }

  return { statusCode, body, universal }
}

// ============================================================================
// ERROR TRANSLATION - Convert errors between provider formats
// ============================================================================

export function translateError(
  universal: UniversalError,
  targetProvider: ProviderType,
): {
  statusCode: number
  body: OpenAIError | GeminiError | AnthropicError
} {
  const result = buildUniversalError(
    universal.type,
    universal.message,
    targetProvider,
    {
      code: universal.code,
      details: universal.details,
      toolName: universal.toolName,
      functionName: universal.functionName,
      usage: universal.usage,
      retryAfter: universal.retryAfter,
    },
  )

  return {
    statusCode: result.statusCode,
    body: result.body,
  }
}

export function isRetryableError(error: UniversalError): boolean {
  const retryableTypes: UniversalErrorType[] = [
    "rate_limit_error",
    "api_error",
    "internal_error",
    "model_overloaded",
    "unavailable",
    "deadline_exceeded",
  ]
  return retryableTypes.includes(error.type)
}

export function isUserError(error: UniversalError): boolean {
  const userErrorTypes: UniversalErrorType[] = [
    "invalid_request_error",
    "invalid_argument",
    "authentication_error",
    "permission_error",
    "not_found_error",
    "context_length_exceeded",
    "content_policy_violation",
    "prompt_too_long",
    "output_too_long",
  ]
  return userErrorTypes.includes(error.type)
}

export function isQuotaError(error: UniversalError): boolean {
  const quotaErrorTypes: UniversalErrorType[] = [
    "rate_limit_error",
    "insufficient_quota",
    "resource_exhausted",
    "token_limit_exceeded",
    "payment_required",
    "trial_expired",
  ]
  return quotaErrorTypes.includes(error.type)
}

// ============================================================================
// LOGGING AND MONITORING HELPERS
// ============================================================================

export function createErrorLogEntry(
  error: UniversalError,
): Record<string, unknown> {
  return {
    timestamp: error.timestamp || Date.now(),
    errorType: error.type,
    provider: error.provider,
    httpStatus: error.httpStatus,
    message: error.message,
    code: error.code,
    toolName: error.toolName,
    functionName: error.functionName,
    retryable: isRetryableError(error),
    userError: isUserError(error),
    quotaError: isQuotaError(error),
    usage: error.usage,
    details: error.details,
  }
}

export function sanitizeErrorForClient(
  error: UniversalError,
): Partial<UniversalError> {
  // Remove sensitive information before sending to client
  return {
    type: error.type,
    message: error.message,
    provider: error.provider,
    httpStatus: error.httpStatus,
    retryAfter: error.retryAfter,
    usage: error.usage,
    // Exclude: originalError, details (may contain sensitive info)
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

// Example: Creating errors
// const authError = createAuthenticationError('openai', 'Invalid API key provided')
// const rateLimitError = createRateLimitError('anthropic', 'Rate limit exceeded', 60)
// const modelError = createModelNotFoundError('google', 'gpt-5-turbo')

// Example: Parsing provider errors
// try {
//   const response = await fetch(openaiUrl, { body, headers })
//   const data = await response.json()
// } catch (error) {
//   const universalError = parseProviderError(error, 'openai', response)
//   console.log('Parsed error:', universalError)
// }

// Example: Translating errors between providers
// const openaiError = parseOpenAIError(originalError)
// const anthropicFormat = translateError(openaiError, 'anthropic')
