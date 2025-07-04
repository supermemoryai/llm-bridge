// ============================================================================
// UNIVERSAL ERROR TYPES - Superset of all provider error types
// ============================================================================

import { ProviderType } from "../types/providers"

export type UniversalErrorType =
  // Standard HTTP/API errors
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "api_error"
  | "internal_error"

  // Provider-specific errors
  | "insufficient_quota"
  | "invalid_argument"
  | "permission_denied"
  | "resource_exhausted"
  | "unauthenticated"
  | "aborted"
  | "out_of_range"
  | "unimplemented"
  | "unavailable"
  | "deadline_exceeded"
  | "already_exists"
  | "failed_precondition"
  | "data_loss"

  // Model-specific errors
  | "model_not_found"
  | "model_overloaded"
  | "context_length_exceeded"
  | "content_filter_error"
  | "invalid_model"
  | "model_not_supported"

  // Tool/Function calling errors
  | "tool_error"
  | "function_not_found"
  | "invalid_function_call"
  | "function_timeout"

  // Token/Billing errors
  | "token_limit_exceeded"
  | "billing_error"
  | "payment_required"
  | "trial_expired"

  // Content/Safety errors
  | "content_policy_violation"
  | "safety_error"
  | "prompt_too_long"
  | "output_too_long"

  // Generic fallback
  | "unknown_error"

// Universal error structure that can represent any provider error
export interface UniversalError {
  type: UniversalErrorType
  message: string
  code?: string | number
  details?: Record<string, unknown>

  // Provider-specific context
  provider: ProviderType
  httpStatus: number

  // Optional fields for enhanced error context
  requestId?: string
  timestamp?: number
  retryAfter?: number // For rate limiting

  // Tool/function specific errors
  toolName?: string
  functionName?: string

  // Token usage info for quota errors
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }

  // Original provider error (for debugging/logging)
  originalError?: {
    provider: ProviderType
    raw: unknown
  }
}

// Provider-specific error interfaces (your original definitions)
export interface OpenAIError {
  error: {
    message: string
    type: string
    param: string | null
    code: string
  }
}

export interface GeminiError {
  error: {
    code: number
    message: string
    status: string
    details: Array<{
      "@type": string
      reason: string
    }>
  }
}

export interface AnthropicError {
  type: "error"
  error: {
    type: string
    message: string
  }
}
