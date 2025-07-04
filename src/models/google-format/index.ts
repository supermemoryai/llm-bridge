import { generateId } from "../../helpers/utils"
import { GeminiBody } from "../../types/providers"
import {
  UniversalBody,
  UniversalContent,
  UniversalMessage,
  UniversalRole,
  UniversalTool,
} from "../../types/universal"

function parseGoogleContent(parts: any[]): UniversalContent[] {
  if (!parts) return []

  return parts.map((part) => {
    if (part.text) {
      return {
        _original: { provider: "google", raw: part },
        text: part.text,
        type: "text" as const,
      }
    }
    if (part.inlineData) {
      const mimeType = part.inlineData.mimeType
      if (mimeType.startsWith("image/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: part.inlineData.data,
            mimeType: mimeType,
          },
          type: "image" as const,
        }
      }
      if (mimeType.startsWith("audio/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: part.inlineData.data,
            mimeType: mimeType,
          },
          type: "audio" as const,
        }
      }
      if (mimeType.startsWith("video/")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: part.inlineData.data,
            mimeType: mimeType,
          },
          type: "video" as const,
        }
      }
      if (mimeType === "application/pdf" || mimeType.includes("document")) {
        return {
          _original: { provider: "google", raw: part },
          media: {
            data: part.inlineData.data,
            fileName: part.fileName || "document.pdf",
            mimeType: mimeType,
          },
          type: "document" as const,
        }
      }
    } else if (part.fileData) {
      return {
        _original: { provider: "google", raw: part },
        media: {
          fileName: part.fileData.fileName || "document",
          fileUri: part.fileData.fileUri,
          mimeType: part.fileData.mimeType,
        },
        type: "document" as const,
      }
    } else if (part.functionCall) {
      return {
        _original: { provider: "google", raw: part },
        tool_call: {
          arguments: part.functionCall.args,
          id: `call_${Date.now()}`,
          metadata: {
            args: part.functionCall.args,
          },
          name: part.functionCall.name,
        },
        type: "tool_call" as const,
      }
    } else if (part.functionResponse) {
      return {
        _original: { provider: "google", raw: part },
        tool_result: {
          name: part.functionResponse.name,
          result: part.functionResponse.response,
          tool_call_id: `call_${part.functionResponse.name}`, // Google doesn't provide call IDs
          metadata: {
            response: part.functionResponse.response,
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
    content: parseGoogleContent(content.parts),
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
      .filter((part: any) => part.text)
      .map((part: any) => part.text)
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

export function universalToGoogle(
  universal: UniversalBody<"google">,
): GeminiBody {
  // If we have the original, we can reconstruct perfectly
  if (universal._original?.provider === "google") {
    return universal._original.raw as GeminiBody
  }

  // Convert universal messages back to Google format
  const contents = universal.messages.map((msg) => ({
    parts: msg.content.map((content) => {
      if (content._original?.provider === "google") {
        return content._original.raw
      }

      if (content.type === "text") {
        return { text: content.text }
      }
      if (content.type === "image") {
        return {
          inlineData: {
            data: content.media!.data,
            mimeType: content.media!.mimeType || "image/jpeg",
          },
        }
      }
      if (content.type === "audio") {
        return {
          inlineData: {
            data: content.media!.data,
            mimeType: content.media!.mimeType || "audio/mp3",
          },
        }
      }
      if (content.type === "video") {
        return {
          inlineData: {
            data: content.media!.data,
            mimeType: content.media!.mimeType || "video/mp4",
          },
        }
      }
      if (content.type === "document") {
        return {
          inlineData: {
            data: content.media!.data,
            mimeType: content.media!.mimeType || "application/pdf",
          },
        }
      }
      if (content.type === "tool_call") {
        return {
          functionCall: {
            args: content.tool_call!.arguments,
            name: content.tool_call!.name,
          },
        }
      }
      if (content.type === "tool_result") {
        return {
          functionResponse: {
            name: content.tool_result!.name,
            response: content.tool_result!.result,
          },
        }
      }

      // Fallback
      return { text: JSON.stringify(content) }
    }) as any,
    role: msg.role === "assistant" ? "model" : msg.role,
  })) as any

  const result: GeminiBody = {
    contents,
  }

  // Add system instruction if present
  if (universal.system) {
    const systemContent =
      typeof universal.system === "string"
        ? universal.system
        : universal.system.content

    result.systemInstruction = {
      parts: [{ text: systemContent }],
    } as any
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

  // Add tools if present
  if (universal.tools) {
    result.tools = [
      {
        functionDeclarations: universal.tools.map((tool) => {
          if (tool._original?.provider === "google") {
            return tool._original.raw as any
          }

          return {
            description: tool.description,
            name: tool.name,
            parameters: tool.parameters,
          }
        }),
      },
    ]

    // Add tool config
    if (universal.tool_choice) {
      result.toolConfig = {
        functionCallingConfig: {
          mode: (universal.tool_choice === "auto"
            ? "AUTO"
            : universal.tool_choice === "required"
            ? "ANY"
            : "NONE") as any,
        },
      }
    }
  }

  // Add provider-specific params
  if (universal.provider_params) {
    if (universal.provider_params.generation_config) {
      result.generationConfig = {
        ...result.generationConfig,
        ...universal.provider_params.generation_config,
      }
    }
    if (universal.provider_params.safety_settings) {
      result.safetySettings = universal.provider_params.safety_settings as any
    }
  }

  return result
}
