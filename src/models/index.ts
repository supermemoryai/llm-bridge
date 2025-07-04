import {
  AnthropicBody,
  GeminiBody,
  InputBody,
  OpenAIBody,
  ProviderType,
} from "../types/providers"
import { UniversalBody } from "../types/universal"
import { anthropicToUniversal, universalToAnthropic } from "./anthropic-format"
import { googleToUniversal, universalToGoogle } from "./google-format"
import { openaiToUniversal, universalToOpenAI } from "./openai-format"

export function toUniversal<T extends ProviderType>(
  provider: T,
  body: InputBody<T>,
): UniversalBody<T> {
  switch (provider) {
    case "openai":
      return openaiToUniversal(body as OpenAIBody) as UniversalBody<T>
    case "anthropic":
      return anthropicToUniversal(body as AnthropicBody) as UniversalBody<T>
    case "google":
      return googleToUniversal(body as GeminiBody) as UniversalBody<T>
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

export function fromUniversal<T extends ProviderType>(
  provider: T,
  universal: UniversalBody<T>,
): InputBody<T> {
  switch (provider) {
    case "openai":
      return universalToOpenAI(
        universal as UniversalBody<"openai">,
      ) as InputBody<T>
    case "anthropic":
      return universalToAnthropic(
        universal as UniversalBody<"anthropic">,
      ) as InputBody<T>
    case "google":
      return universalToGoogle(
        universal as UniversalBody<"google">,
      ) as InputBody<T>
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

export * from "./helpers"

export * from "./translate"

export * from "./detector"

export * from "./openai-format"

export * from "./anthropic-format"

export * from "./google-format"
