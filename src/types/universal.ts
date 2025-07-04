import { ProviderType } from "./providers"

export type UniversalRole =
  | "system"
  | "user"
  | "assistant"
  | "tool"
  | "developer"

export type UniversalMediaContent = {
  // URL-based (OpenAI style)
  url?: string
  detail?: "low" | "high" | "auto" // OpenAI image detail

  // Base64 data (Anthropic, Google style)
  data?: string
  mimeType?: string

  // File reference (Google Cloud Storage, etc.)
  fileUri?: string
  fileName?: string

  // Size/duration info
  size?: number
  duration?: number // For audio/video

  // Provider-specific media metadata
  metadata?: Record<string, unknown>
}

export type UniversalToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>

  // Provider-specific tool call metadata
  metadata?: {
    // OpenAI
    type?: "function"

    // Anthropic
    input?: unknown // Anthropic uses 'input' instead of 'arguments'

    // Google
    args?: unknown // Google uses 'args'

    // Preserve unknown fields
    [key: string]: unknown
  }
}

export type UniversalToolResult = {
  tool_call_id: string
  name: string
  result: unknown
  error?: string

  // Provider-specific result metadata
  metadata?: {
    // Anthropic
    tool_use_id?: string // Anthropic uses this instead of tool_call_id
    content?: unknown // Anthropic wraps result in 'content'

    [key: string]: unknown
  }
}

export type UniversalContent = {
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "tool_call"
    | "tool_result"

  // Text content
  text?: string

  // Media content - support all possible ways providers handle media
  media?: UniversalMediaContent

  // Tool call/result content
  tool_call?: UniversalToolCall
  tool_result?: UniversalToolResult

  // Preserve original content structure to prevent data loss
  _original?: {
    provider: ProviderType
    raw: unknown // The exact original content object
  }
}

export type UniversalMessage<TProvider extends ProviderType = ProviderType> = {
  // Universal fields
  id: string // Generated if not provided
  role: UniversalRole
  content: UniversalContent[]

  // Provider-specific metadata preservation
  metadata: {
    provider: TProvider
    originalRole?: string // In case there are custom roles we don't know about
    originalIndex?: number // Position in original messages array

    // Anthropic-specific
    cache_control?: { type: "ephemeral" }

    // OpenAI-specific
    name?: string // For tool responses
    tool_call_id?: string // For tool responses

    // Google-specific
    parts_metadata?: unknown[] // For preserving original parts structure

    // Preserve any unknown fields
    [key: string]: unknown
  }

  // Tool calling (if this message contains tool calls)
  tool_calls?: UniversalToolCall[]
}

export type UniversalSystemPrompt = {
  content: string

  // Support for complex system prompts
  parts?: Array<{
    type: "text" | "image"
    text?: string
    media?: UniversalMediaContent
  }>

  // Anthropic cache control
  cache_control?: { type: "ephemeral" }

  // Preserve original system prompt structure
  _original?: {
    provider: ProviderType
    raw: unknown
  }
}

export type UniversalTool = {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema

  // Provider-specific tool metadata
  metadata?: {
    // OpenAI
    type?: "function"

    // Anthropic
    input_schema?: unknown // Anthropic uses this instead of parameters

    // Google
    function_declarations?: unknown

    [key: string]: unknown
  }

  // Preserve original tool definition
  _original?: {
    provider: ProviderType
    raw: unknown
  }
}

export type UniversalBody<TProvider extends ProviderType = ProviderType> = {
  provider: TProvider

  // System prompt handling - superset approach
  system?: string | UniversalSystemPrompt

  messages: UniversalMessage<TProvider>[]

  // Generation parameters - superset
  model: string
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  stream?: boolean

  // Tools - universal format
  tools?: UniversalTool[]
  tool_choice?: "auto" | "required" | "none" | { name: string }

  // Provider-specific parameters preserved
  provider_params?: {
    // Anthropic
    anthropic_version?: string
    stop_sequences?: string[]

    // Google
    generation_config?: unknown
    safety_settings?: unknown

    // OpenAI
    response_format?: unknown
    logprobs?: boolean
    top_logprobs?: number

    // Preserve any unknown parameters
    [key: string]: unknown
  }

  // Complete original request preservation
  _original?: {
    provider: TProvider
    raw: unknown // The complete original request body
  }
}
