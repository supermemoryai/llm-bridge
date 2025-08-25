import type Anthropic from "@anthropic-ai/sdk"
import type { GenerateContentRequest } from "@google/generative-ai"
import type OpenAI from "openai"
import type {
  ResponseCreateParams as OpenAIResponsesCreateParams,
} from "openai/resources/responses/responses"

export type ProviderType = "openai" | "anthropic" | "google"

type ExpandRecursively<T> = T extends (...args: any[]) => any
  ? T
  : // leave functions as-is
  T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T

export type OpenAIChatBody =
  ExpandRecursively<OpenAI.Chat.ChatCompletionCreateParams>

export type OpenAIResponsesBody = ExpandRecursively<OpenAIResponsesCreateParams>

export type OpenAIBody = OpenAIChatBody | OpenAIResponsesBody
export type GeminiBody = ExpandRecursively<GenerateContentRequest>
export type AnthropicBody = ExpandRecursively<Anthropic.MessageCreateParams>

export type InputBody<T extends ProviderType> = T extends "openai"
  ? OpenAIBody
  : T extends "anthropic"
  ? AnthropicBody
  : T extends "google"
  ? GeminiBody
  : never
