import { ProviderType } from "../types/providers"

export class UniversalTranslationError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: ProviderType,
    public details?: unknown,
  ) {
    super(message)
    this.name = "UniversalTranslationError"
  }
}

export function createTranslationError(
  message: string,
  code: string,
  provider?: ProviderType,
  details?: unknown,
): UniversalTranslationError {
  return new UniversalTranslationError(message, code, provider, details)
}

export * from "./universal"
export * from "./parser"
export * from "./utils"
