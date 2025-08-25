import { generateId } from "../../helpers/utils"
import { GeminiBody } from "../../types/providers"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
} from "../../types/universal"

type GoogleSDKPart = NonNullable<
  NonNullable<GeminiBody["contents"]>[number]["parts"]
>[number]

function parseGoogleContent(parts: GoogleSDKPart[] | undefined): UniversalContent[] {
  if (!parts || parts.length === 0) return []

  return parts.map((part) => {
    if ("text" in part && typeof (part as { text?: unknown }).text === "string") {
      return {
        _original: { provider: "google", raw: part },
        text: (part as { text: string }).text,
        type: "text" as const,
      }
    }
    if ("inlineData" in part) {
      const mimeType = (part as { inlineData: { mimeType: string } }).inlineData.mimeType
      if (mimeType.startsWith("image/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: (part as { inlineData: { data: string } }).inlineData.data,
            mimeType,
          },
          type: "image" as const,
        }
      }
      if (mimeType.startsWith("audio/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: (part as { inlineData: { data: string } }).inlineData.data,
            mimeType,
          },
          type: "audio" as const,
        }
      }
      if (mimeType.startsWith("video/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: (part as { inlineData: { data: string } }).inlineData.data,
            mimeType,
          },
          type: "video" as const,
        }
      }
      if (mimeType === "application/pdf" || mimeType.includes("document")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: (part as { inlineData: { data: string } }).inlineData.data,
            fileName: (part as { fileName?: string }).fileName || "document.pdf",
            mimeType,
          },
          type: "document" as const,
        }
      }
    } else if ("fileData" in part) {
      return {
        _original: { provider: "google", raw: part },
        media: {
          fileName: (part as { fileData: { fileName?: string } }).fileData.fileName || "document",
          fileUri: (part as { fileData: { fileUri: string } }).fileData.fileUri,
          mimeType: (part as { fileData: { mimeType: string } }).fileData.mimeType,
        },
        type: "document" as const,
      }
    } else if ("functionCall" in part) {
      return {
        _original: { provider: "google", raw: part },
        tool_call: {
          arguments: (part as { functionCall: { args: Record<string, unknown> } }).functionCall.args,
          id: `call_${Date.now()}`,
          metadata: {
            args: (part as { functionCall: { args: Record<string, unknown> } }).functionCall.args,
          },
          name: (part as { functionCall: { name: string } }).functionCall.name,
        },
        type: "tool_call" as const,
      }
    } else if ("functionResponse" in part) {
      return {
        _original: { provider: "google", raw: part },
        tool_result: {
          name: (part as { functionResponse: { name: string } }).functionResponse.name,
          result: (part as { functionResponse: { response: unknown } }).functionResponse.response,
          tool_call_id: `call_${(part as { functionResponse: { name: string } }).functionResponse.name}`, // Google doesn't provide call IDs
          metadata: {
            response: (part as { functionResponse: { response: unknown } }).functionResponse.response,
          },
        },
        type: "tool_result" as const,
      }
    }

    return {
      _original: { provider: "google", raw: part },
      text: JSON.stringify(part),
      type: "text" as const,
    }
  })
}

export function googleToUniversal(body: GeminiBody): UniversalBody<"google"> {
  const universalMessages: UniversalMessage<"google">[] = (
    body.contents || []
  ).map((content, index) => ({
    content: parseGoogleContent(content.parts as GoogleSDKPart[] | undefined),
    id: generateId(),
    metadata: {
      originalIndex: index,
      parts_metadata: content.parts,
      provider: "google",
    },
    role:
      content.role === "model" ? "assistant" : (content.role as UniversalRole),
  }))

  // Extract tools from function declarations
  const tools: UniversalTool[] = []
  if (body.tools) {
    for (const tool of body.tools) {
      if ("functionDeclarations" in tool && tool.functionDeclarations) {
        for (const fn of tool.functionDeclarations) {
          tools.push({
            _original: { provider: "google", raw: fn },
            description: fn.description || "",
            metadata: {
              function_declarations: fn,
            },
            name: fn.name,
            parameters: fn.parameters || {},
          })
        }
      }
    }
  }

  // Extract system prompt
  let systemPrompt: string | undefined
  if (
    body.systemInstruction &&
    typeof body.systemInstruction === "object" &&
    "parts" in body.systemInstruction &&
    body.systemInstruction.parts
  ) {
    systemPrompt = body.systemInstruction.parts
      .filter((part: { text?: string }) => part.text)
      .map((part: { text?: string }) => part.text as string)
      .join(" ")
  }

  return {
    _original: { provider: "google", raw: body },
    max_tokens: body.generationConfig?.maxOutputTokens,
    messages: universalMessages,
    model: "gemini-pro", // Google doesn't always include model in request
    provider: "google",
    provider_params: {
      generation_config: body.generationConfig,
      safety_settings: body.safetySettings,
    },
    stream: false,
    system: systemPrompt, // Streaming is handled differently in Google
    temperature: body.generationConfig?.temperature,
    tool_choice:
      body.toolConfig?.functionCallingConfig?.mode?.toLowerCase() as any,
    tools: tools.length > 0 ? tools : undefined,
    top_p: body.generationConfig?.topP,
  }
}

function hasMessagesBeenModified(universal: UniversalBody<"google">): boolean {
  if (!universal._original?.raw) return true
  
  const originalBody = universal._original.raw as GeminiBody
  const originalMessages = originalBody.contents || []
  
  // Check if message count changed
  if (originalMessages.length !== universal.messages.length) return true
  
  // Check if any messages have contextInjection metadata (indicates injection)
  const hasInjectedMessages = universal.messages.some(m => 
    m.metadata.contextInjection || 
    !m.metadata.originalIndex // New messages without originalIndex
  )
  
  return hasInjectedMessages
}

function isValidGooglePartObject(value: unknown): value is GoogleSDKPart {
  if (typeof value !== "object" || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.text === "string") return true
  if (obj.inlineData && typeof obj.inlineData === "object") {
    const id = obj.inlineData as { data?: unknown; mimeType?: unknown }
    return typeof id.data === "string" && typeof id.mimeType === "string"
  }
  if (obj.fileData && typeof obj.fileData === "object") {
    const fd = obj.fileData as { fileUri?: unknown; mimeType?: unknown }
    return typeof fd.fileUri === "string" && typeof fd.mimeType === "string"
  }
  if (obj.functionCall && typeof obj.functionCall === "object") {
    const fc = obj.functionCall as { name?: unknown; args?: unknown }
    return typeof fc.name === "string" && typeof fc.args === "object" && fc.args !== null
  }
  if (obj.functionResponse && typeof obj.functionResponse === "object") {
    const fr = obj.functionResponse as { name?: unknown; response?: unknown }
    return typeof fr.name === "string"
  }
  return false
}

export function universalToGoogle(
  universal: UniversalBody<"google">,
): GeminiBody {
  // If we have the original and no modifications, we can reconstruct perfectly
  if (universal._original?.provider === "google" && !hasMessagesBeenModified(universal)) {
    return universal._original.raw as GeminiBody
  }

  // Separate system messages from regular messages
  const systemMessages = universal.messages.filter(msg => msg.role === "system")
  const regularMessages = universal.messages.filter(msg => msg.role !== "system")

  // Convert universal messages back to Google format
  const contents = regularMessages.map((msg) => ({
    parts: msg.content.map((content) => {
      if (content._original?.provider === "google") {
        const originalRaw = content._original.raw
        if (typeof originalRaw === "string") {
          throw new Error(
            `Invalid _original.raw format for Google provider. Expected object with 'text' property, got string: "${originalRaw}". ` +
              `Remove the _original field and let the library auto-generate it, or use format: { text: "${originalRaw}" }`,
          )
        }
        if (isValidGooglePartObject(originalRaw)) {
          return originalRaw
        }
        throw new Error(
          `Invalid _original.raw format for Google provider. Expected object with 'text' property, got: ${JSON.stringify(originalRaw)}`,
        )
      }
      if (content.type === "text") {
        return { text: content.text ?? "" }
      }
      if (content.type === "image") {
        return {
          inlineData: {
            data: content.media?.data ?? "",
            mimeType: content.media?.mimeType || "image/jpeg",
          },
        }
      }
      if (content.type === "audio") {
        return {
          inlineData: {
            data: content.media?.data ?? "",
            mimeType: content.media?.mimeType || "audio/mp3",
          },
        }
      }
      if (content.type === "video") {
        return {
          inlineData: {
            data: content.media?.data ?? "",
            mimeType: content.media?.mimeType || "video/mp4",
          },
        }
      }
      if (content.type === "document") {
        return {
          inlineData: {
            data: content.media?.data ?? "",
            mimeType: content.media?.mimeType || "application/pdf",
          },
        }
      }
      if (content.type === "tool_call") {
        return {
          functionCall: {
            args: content.tool_call?.arguments ?? {},
            name: content.tool_call?.name ?? "",
          },
        }
      }
      if (content.type === "tool_result") {
        return {
          functionResponse: {
            name: content.tool_result?.name ?? "",
            response:
              typeof content.tool_result?.result === "object" && content.tool_result?.result !== null
                ? (content.tool_result?.result as object)
                : { value: content.tool_result?.result },
          },
        }
      }

      // Fallback
      return { text: JSON.stringify(content) }
    }),
    role: (msg.role === "assistant" ? "model" : (msg.role as "user" | "model")),
  }))

  const result: GeminiBody = {
    contents: contents as GeminiBody["contents"],
  }

  // Add system instruction if present
  const systemParts: Array<{ text: string }> = []
  
  // Add system from universal.system field
  if (universal.system) {
    const systemContent =
      typeof universal.system === "string"
        ? universal.system
        : universal.system.content

    systemParts.push({ text: systemContent })
  }
  
  // Add system messages from messages array
  if (systemMessages.length > 0) {
    for (const systemMsg of systemMessages) {
      for (const content of systemMsg.content) {
        if (content.type === "text") {
          systemParts.push({ text: content.text ?? "" })
        }
        // Note: Google system instructions only support text content
      }
    }
  }
  
  if (systemParts.length > 0) {
    // The SDK expects a Content-like object; setting parts is sufficient
    // We avoid over-typing here to maintain compatibility across SDK versions
    ;(result as { systemInstruction?: { parts: Array<{ text: string }> } }).systemInstruction = {
      parts: systemParts,
    }
  }

  // Add generation config
  if (
    universal.temperature !== undefined ||
    universal.max_tokens !== undefined ||
    universal.top_p !== undefined
  ) {
    result.generationConfig = {
      maxOutputTokens: universal.max_tokens,
      temperature: universal.temperature,
      topP: universal.top_p,
    }
  }

  // Omit tool declarations to avoid schema mismatches with Google SDK types

  // Add provider-specific params
  if (universal.provider_params) {
    if (universal.provider_params.generation_config) {
      result.generationConfig = {
        ...result.generationConfig,
        ...universal.provider_params.generation_config,
      }
    }
    if (universal.provider_params.safety_settings) {
      result.safetySettings = universal.provider_params.safety_settings as GeminiBody["safetySettings"]
    }
  }

  return result
}
