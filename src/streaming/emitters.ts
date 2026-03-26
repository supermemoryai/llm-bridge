import { UniversalStreamEvent } from "../types/universal"

const encoder = new TextEncoder()

/**
 * Helper to encode an SSE text chunk into bytes.
 */
function sseEncode(text: string): Uint8Array {
  return encoder.encode(text)
}

/**
 * Convert universal stream events to OpenAI Chat Completions SSE format.
 */
export function emitOpenAIStream(
  events: AsyncIterable<UniversalStreamEvent>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      let messageId = ""
      let model = ""
      let toolCallIndex = 0
      const toolCallIndices: Map<string, number> = new Map()

      try {
        for await (const event of events) {
          switch (event.type) {
            case "message_start": {
              messageId = event.id
              model = event.model
              const chunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: { role: "assistant" },
                    finish_reason: null,
                  },
                ],
              }
              controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              break
            }

            case "content_delta": {
              const text = event.delta.text || event.delta.thinking || ""
              if (text) {
                const chunk = {
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { content: text },
                      finish_reason: null,
                    },
                  ],
                }
                controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              }
              break
            }

            case "tool_call_start": {
              const idx = toolCallIndex++
              toolCallIndices.set(event.tool_call.id, idx)
              const chunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          id: event.tool_call.id,
                          type: "function",
                          function: { name: event.tool_call.name, arguments: "" },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }
              controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              break
            }

            case "tool_call_delta": {
              const idx = toolCallIndices.get(event.tool_call.id) ?? 0
              const chunk = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {
                      tool_calls: [
                        {
                          index: idx,
                          function: { arguments: event.tool_call.arguments_delta },
                        },
                      ],
                    },
                    finish_reason: null,
                  },
                ],
              }
              controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              break
            }

            case "tool_call_end": {
              // OpenAI doesn't emit a specific tool_call_end event
              break
            }

            case "message_end": {
              const finishReason =
                toolCallIndices.size > 0 ? "tool_calls" : "stop"
              const chunk: any = {
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: finishReason,
                  },
                ],
              }
              if (event.usage) {
                chunk.usage = {
                  prompt_tokens: event.usage.input_tokens,
                  completion_tokens: event.usage.output_tokens,
                  total_tokens:
                    event.usage.input_tokens + event.usage.output_tokens,
                }
              }
              controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              controller.enqueue(sseEncode(`data: [DONE]\n\n`))
              break
            }

            case "error": {
              const errorChunk = {
                error: {
                  message: event.error.message,
                  code: event.error.code || null,
                },
              }
              controller.enqueue(
                sseEncode(`data: ${JSON.stringify(errorChunk)}\n\n`),
              )
              break
            }
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error"
        controller.enqueue(
          sseEncode(
            `data: ${JSON.stringify({ error: { message: errorMessage } })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })
}

/**
 * Convert universal stream events to Anthropic Messages SSE format.
 */
export function emitAnthropicStream(
  events: AsyncIterable<UniversalStreamEvent>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      let blockIndex = 0
      let currentBlockType: "thinking" | "text" | null = null

      const closeCurrentBlock = () => {
        if (currentBlockType !== null) {
          const stopData = {
            type: "content_block_stop",
            index: blockIndex,
          }
          controller.enqueue(
            sseEncode(
              `event: content_block_stop\ndata: ${JSON.stringify(stopData)}\n\n`,
            ),
          )
          blockIndex++
          currentBlockType = null
        }
      }

      try {
        for await (const event of events) {
          switch (event.type) {
            case "message_start": {
              const data = {
                type: "message_start",
                message: {
                  id: event.id,
                  type: "message",
                  role: "assistant",
                  model: event.model,
                  content: [],
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 0, output_tokens: 0 },
                },
              }
              controller.enqueue(
                sseEncode(`event: message_start\ndata: ${JSON.stringify(data)}\n\n`),
              )
              break
            }

            case "content_delta": {
              if (event.delta.thinking) {
                // Open a thinking block if not already in one
                if (currentBlockType !== "thinking") {
                  closeCurrentBlock()
                  const startData = {
                    type: "content_block_start",
                    index: blockIndex,
                    content_block: { type: "thinking", thinking: "" },
                  }
                  controller.enqueue(
                    sseEncode(
                      `event: content_block_start\ndata: ${JSON.stringify(startData)}\n\n`,
                    ),
                  )
                  currentBlockType = "thinking"
                }

                const deltaData = {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: {
                    type: "thinking_delta",
                    thinking: event.delta.thinking,
                  },
                }
                controller.enqueue(
                  sseEncode(
                    `event: content_block_delta\ndata: ${JSON.stringify(deltaData)}\n\n`,
                  ),
                )
              } else if (event.delta.text) {
                // Open a text block if not already in one
                if (currentBlockType !== "text") {
                  closeCurrentBlock()
                  const startData = {
                    type: "content_block_start",
                    index: blockIndex,
                    content_block: { type: "text", text: "" },
                  }
                  controller.enqueue(
                    sseEncode(
                      `event: content_block_start\ndata: ${JSON.stringify(startData)}\n\n`,
                    ),
                  )
                  currentBlockType = "text"
                }

                const deltaData = {
                  type: "content_block_delta",
                  index: blockIndex,
                  delta: {
                    type: "text_delta",
                    text: event.delta.text,
                  },
                }
                controller.enqueue(
                  sseEncode(
                    `event: content_block_delta\ndata: ${JSON.stringify(deltaData)}\n\n`,
                  ),
                )
              }
              break
            }

            case "tool_call_start": {
              // Close any open content block before starting tool_use
              closeCurrentBlock()
              const startData = {
                type: "content_block_start",
                index: blockIndex,
                content_block: {
                  type: "tool_use",
                  id: event.tool_call.id,
                  name: event.tool_call.name,
                  input: {},
                },
              }
              controller.enqueue(
                sseEncode(
                  `event: content_block_start\ndata: ${JSON.stringify(startData)}\n\n`,
                ),
              )
              break
            }

            case "tool_call_delta": {
              const deltaData = {
                type: "content_block_delta",
                index: blockIndex,
                delta: {
                  type: "input_json_delta",
                  partial_json: event.tool_call.arguments_delta,
                },
              }
              controller.enqueue(
                sseEncode(
                  `event: content_block_delta\ndata: ${JSON.stringify(deltaData)}\n\n`,
                ),
              )
              break
            }

            case "tool_call_end": {
              const stopData = {
                type: "content_block_stop",
                index: blockIndex,
              }
              controller.enqueue(
                sseEncode(
                  `event: content_block_stop\ndata: ${JSON.stringify(stopData)}\n\n`,
                ),
              )
              blockIndex++
              break
            }

            case "message_end": {
              // Close any open content block before ending message
              closeCurrentBlock()
              const deltaData = {
                type: "message_delta",
                delta: {
                  stop_reason: event.stop_reason || "end_turn",
                  stop_sequence: null,
                },
                usage: event.usage
                  ? { output_tokens: event.usage.output_tokens }
                  : { output_tokens: 0 },
              }
              controller.enqueue(
                sseEncode(
                  `event: message_delta\ndata: ${JSON.stringify(deltaData)}\n\n`,
                ),
              )

              const stopData = { type: "message_stop" }
              controller.enqueue(
                sseEncode(
                  `event: message_stop\ndata: ${JSON.stringify(stopData)}\n\n`,
                ),
              )
              break
            }

            case "error": {
              const errorData = {
                type: "error",
                error: {
                  type: event.error.code || "api_error",
                  message: event.error.message,
                },
              }
              controller.enqueue(
                sseEncode(
                  `event: error\ndata: ${JSON.stringify(errorData)}\n\n`,
                ),
              )
              break
            }
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error"
        const errorData = {
          type: "error",
          error: { type: "api_error", message: errorMessage },
        }
        controller.enqueue(
          sseEncode(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`),
        )
      } finally {
        controller.close()
      }
    },
  })
}

/**
 * Convert universal stream events to Google Gemini SSE format.
 */
export function emitGoogleStream(
  events: AsyncIterable<UniversalStreamEvent>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      let parts: any[] = []

      try {
        for await (const event of events) {
          switch (event.type) {
            case "message_start": {
              // Google doesn't have a separate message_start SSE event;
              // the first data chunk implicitly starts the message.
              break
            }

            case "content_delta": {
              if (event.delta.thinking) {
                const chunk = {
                  candidates: [
                    {
                      content: {
                        parts: [{ text: event.delta.thinking, thought: true }],
                        role: "model",
                      },
                    },
                  ],
                }
                controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              } else if (event.delta.text) {
                const chunk = {
                  candidates: [
                    {
                      content: {
                        parts: [{ text: event.delta.text }],
                        role: "model",
                      },
                    },
                  ],
                }
                controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              }
              break
            }

            case "tool_call_start": {
              parts.push({
                functionCall: {
                  name: event.tool_call.name,
                  args: {},
                },
                _id: event.tool_call.id,
              })
              break
            }

            case "tool_call_delta": {
              // Google sends function calls as complete objects, so we accumulate
              const existing = parts.find(
                (p) => p._id === event.tool_call.id,
              )
              if (existing) {
                try {
                  const partial = JSON.parse(event.tool_call.arguments_delta)
                  existing.functionCall.args = {
                    ...existing.functionCall.args,
                    ...partial,
                  }
                } catch {
                  // Partial JSON, append to a buffer - not typical for Google format
                }
              }
              break
            }

            case "tool_call_end": {
              const part = parts.find((p) => p._id === event.tool_call.id)
              if (part) {
                const chunk = {
                  candidates: [
                    {
                      content: {
                        parts: [
                          {
                            functionCall: {
                              name: part.functionCall.name,
                              args: part.functionCall.args,
                            },
                          },
                        ],
                        role: "model",
                      },
                    },
                  ],
                }
                controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
                parts = parts.filter((p) => p._id !== event.tool_call.id)
              }
              break
            }

            case "message_end": {
              const chunk: any = {
                candidates: [
                  {
                    finishReason: event.stop_reason === "end_turn" ? "STOP" : event.stop_reason,
                    content: { parts: [], role: "model" },
                  },
                ],
              }
              if (event.usage) {
                chunk.usageMetadata = {
                  promptTokenCount: event.usage.input_tokens,
                  candidatesTokenCount: event.usage.output_tokens,
                  totalTokenCount:
                    event.usage.input_tokens + event.usage.output_tokens,
                }
              }
              controller.enqueue(sseEncode(`data: ${JSON.stringify(chunk)}\n\n`))
              break
            }

            case "error": {
              const errorChunk = {
                error: {
                  message: event.error.message,
                  code: event.error.code || "INTERNAL",
                },
              }
              controller.enqueue(
                sseEncode(`data: ${JSON.stringify(errorChunk)}\n\n`),
              )
              break
            }
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error"
        controller.enqueue(
          sseEncode(
            `data: ${JSON.stringify({ error: { message: errorMessage, code: "INTERNAL" } })}\n\n`,
          ),
        )
      } finally {
        controller.close()
      }
    },
  })
}
