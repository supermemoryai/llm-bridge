import { fromUniversal, toUniversal } from "./models"
import { detectProvider } from "./models/detector"
import {
  countUniversalTokens,
  createObservabilityData,
  extractModelFromUniversal,
} from "./models/helpers"
import {
  parseOpenAIStream,
  parseAnthropicStream,
  parseGoogleStream,
  parseOpenAIResponsesStream,
} from "./streaming/parsers"
import {
  emitOpenAIStream,
  emitOpenAIResponsesStream,
  emitAnthropicStream,
  emitGoogleStream,
} from "./streaming/emitters"
import { ObservabilityData } from "./types/observability"
import { ProviderType } from "./types/providers"
import { UniversalBody, UniversalStreamEvent } from "./types/universal"

export async function handleUniversalRequest(
  targetUrl: string,
  body: unknown,
  headers: Record<string, string>,
  method: string,
  editFunction: (request: UniversalBody) => Promise<{
    request: UniversalBody
    contextModified: boolean
  }>,
  options: {
    requestId?: string
    enableObservability?: boolean
  } = {},
): Promise<{
  response: Response
  observabilityData?: ObservabilityData
}> {
  const requestId =
    options.requestId ||
    `req_${Date.now()}_${Math.random().toString(36).substring(7)}`

  // Detect provider and convert to universal
  const provider = detectProvider(targetUrl, body)
  const universal = toUniversal(provider, body as any)

  // Extract model name
  const model = extractModelFromUniversal(universal)

  // Count original tokens and analyze content
  const originalAnalysis = countUniversalTokens(universal)

  // Edit the request (your Supermemory magic)
  const { request: editedRequest, contextModified } = await editFunction(
    universal,
  )

  // Count final tokens
  const finalAnalysis = countUniversalTokens(editedRequest)

  // Translate back to provider format
  const translatedBody = fromUniversal(provider, editedRequest as any)

  delete headers["Content-Type"]

  // Make the request to the provider
  const response = await fetch(targetUrl, {
    body: JSON.stringify(translatedBody),
    headers,
    method,
  })

  // Create observability data if enabled
  let observabilityData: ObservabilityData | undefined
  if (options.enableObservability !== false) {
    observabilityData = await createObservabilityData(
      originalAnalysis.inputTokens,
      finalAnalysis.inputTokens,
      provider,
      model,
      contextModified,
      {
        estimatedOutputTokens: finalAnalysis.estimatedOutputTokens,
        multimodalContentCount: finalAnalysis.multimodalContentCount,
        requestId,
        toolCallsCount: finalAnalysis.toolCallsCount,
      },
    )
  }

  return {
    observabilityData,
    response,
  }
}

/**
 * Get the appropriate SSE stream parser for a given provider.
 */
function getParser(
  provider: ProviderType,
): (stream: ReadableStream) => AsyncGenerator<UniversalStreamEvent> {
  switch (provider) {
    case "openai":
      return parseOpenAIStream
    case "anthropic":
      return parseAnthropicStream
    case "google":
      return parseGoogleStream
    case "openai-responses":
      return parseOpenAIResponsesStream
    default:
      throw new Error(`Unsupported source provider for streaming: ${provider}`)
  }
}

/**
 * Get the appropriate SSE stream emitter for a given provider.
 */
function getEmitter(
  provider: ProviderType,
): (events: AsyncIterable<UniversalStreamEvent>) => ReadableStream {
  switch (provider) {
    case "openai":
      return emitOpenAIStream
    case "openai-responses":
      return emitOpenAIResponsesStream
    case "anthropic":
      return emitAnthropicStream
    case "google":
      return emitGoogleStream
    default:
      throw new Error(`Unsupported target provider for streaming: ${provider}`)
  }
}

/**
 * Handle streaming translation between providers.
 *
 * Takes an SSE stream from the source provider, parses it into universal
 * stream events, optionally transforms those events, and re-emits them
 * in the target provider's SSE format.
 *
 * @param stream - The source SSE ReadableStream from the provider response
 * @param sourceProvider - The provider that produced the stream
 * @param targetProvider - The provider format to emit
 * @param transform - Optional async generator transform to apply to universal events
 * @returns A ReadableStream of SSE text in the target provider's format
 */
export function handleUniversalStreamRequest(
  stream: ReadableStream,
  sourceProvider: ProviderType,
  targetProvider: ProviderType,
  transform?: (
    events: AsyncIterable<UniversalStreamEvent>,
  ) => AsyncIterable<UniversalStreamEvent>,
): ReadableStream {
  const parser = getParser(sourceProvider)
  const emitter = getEmitter(targetProvider)

  // Parse the source stream into universal events
  let universalEvents: AsyncIterable<UniversalStreamEvent> = parser(stream)

  // Apply optional transform
  if (transform) {
    universalEvents = transform(universalEvents)
  }

  // Emit in target format
  return emitter(universalEvents)
}
