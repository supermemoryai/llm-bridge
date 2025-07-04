import { ProviderType } from "../types/providers"
import { buildUniversalError } from "./universal"

export function createAuthenticationError(
  provider: ProviderType,
  message = "Invalid API key",
) {
  return buildUniversalError("authentication_error", message, provider)
}

export function createRateLimitError(
  provider: ProviderType,
  message = "Rate limit exceeded",
  retryAfter?: number,
) {
  return buildUniversalError("rate_limit_error", message, provider, {
    retryAfter,
  })
}

export function createModelNotFoundError(
  provider: ProviderType,
  modelName: string,
) {
  return buildUniversalError(
    "model_not_found",
    `Model '${modelName}' not found`,
    provider,
    { details: { modelName } },
  )
}

export function createContextLengthError(
  provider: ProviderType,
  tokenCount: number,
  maxTokens: number,
) {
  return buildUniversalError(
    "context_length_exceeded",
    `Token count ${tokenCount} exceeds maximum ${maxTokens}`,
    provider,
    {
      details: { tokenCount, maxTokens },
      usage: { totalTokens: tokenCount },
    },
  )
}

export function createToolError(
  provider: ProviderType,
  toolName: string,
  message: string,
) {
  return buildUniversalError(
    "tool_error",
    `Tool '${toolName}' error: ${message}`,
    provider,
    { toolName, details: { toolName } },
  )
}

export function createContentFilterError(
  provider: ProviderType,
  message = "Content policy violation",
) {
  return buildUniversalError("content_policy_violation", message, provider)
}
