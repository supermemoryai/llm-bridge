import { fromUniversal, toUniversal } from "./models"
import { detectProvider } from "./models/detector"
import {
  countUniversalTokens,
  createObservabilityData,
  extractModelFromUniversal,
} from "./models/helpers"
import { ObservabilityData } from "./types/observability"
import { UniversalBody } from "./types/universal"

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

  console.log('[LLM BRIDGE] EDITED REQUEST', JSON.stringify(editedRequest, null, 2))

  // Translate back to provider format
  const translatedBody = fromUniversal(provider, editedRequest as any)

  delete headers["Content-Type"]

  console.log(`LLM BRIDGE translated body ${JSON.stringify(translatedBody, null, 2)}`)
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
