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
 * Convert universal stream events to OpenAI Responses API SSE format.
 *
 * The Responses API uses semantic event types (response.created,
 * response.output_text.delta, etc.) rather than the Chat Completions
 * chunk format.
 */
export function emitOpenAIResponsesStream(
  events: AsyncIterable<UniversalStreamEvent>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      let responseId = ""
      let model = ""
      let outputIndex = 0
      let contentIndex = 0
      // Track accumulated text per output item for "done" events
      let accumulatedText = ""
      // Whether we've announced a message output item for text content
      let messageItemAnnounced = false
      // Track accumulated arguments per tool call
      const toolCallArgs = new Map<string, { name: string; args: string; outputIndex: number }>()

      // Lazily announce a message output item when the first text delta arrives
      const ensureMessageItem = () => {
        if (!messageItemAnnounced) {
          const itemAddedData = {
            type: "response.output_item.added",
            output_index: outputIndex,
            item: {
              type: "message",
              id: `item_${outputIndex}`,
              role: "assistant",
              content: [],
            },
          }
          controller.enqueue(
            sseEncode(`event: response.output_item.added\ndata: ${JSON.stringify(itemAddedData)}\n\n`),
          )
          messageItemAnnounced = true
        }
      }

      // Close the current message output item (text done + item done) and advance outputIndex
      const closeMessageItem = () => {
        if (accumulatedText && messageItemAnnounced) {
          const textDoneData = {
            type: "response.output_text.done",
            output_index: outputIndex,
            content_index: contentIndex,
            text: accumulatedText,
          }
          controller.enqueue(
            sseEncode(`event: response.output_text.done\ndata: ${JSON.stringify(textDoneData)}\n\n`),
          )
          const itemDoneData = {
            type: "response.output_item.done",
            output_index: outputIndex,
            item: {
              type: "message",
              id: `item_${outputIndex}`,
              role: "assistant",
              content: [{ type: "output_text", text: accumulatedText }],
            },
          }
          controller.enqueue(
            sseEncode(`event: response.output_item.done\ndata: ${JSON.stringify(itemDoneData)}\n\n`),
          )
          outputIndex++
          accumulatedText = ""
          messageItemAnnounced = false
        }
      }

      try {
        for await (const event of events) {
          switch (event.type) {
            case "message_start": {
              responseId = event.id
              model = event.model
              const data = {
                type: "response.created",
                response: {
                  id: responseId,
                  object: "response",
                  status: "in_progress",
                  model,
                  output: [],
                },
              }
              controller.enqueue(
                sseEncode(`event: response.created\ndata: ${JSON.stringify(data)}\n\n`),
              )
              accumulatedText = ""
              contentIndex = 0
              messageItemAnnounced = false
              break
            }

            case "content_delta": {
              const text = event.delta.text || event.delta.thinking || ""
              if (text) {
                ensureMessageItem()
                accumulatedText += text
                const deltaData = {
                  type: "response.output_text.delta",
                  output_index: outputIndex,
                  content_index: contentIndex,
                  delta: text,
                }
                controller.enqueue(
                  sseEncode(`event: response.output_text.delta\ndata: ${JSON.stringify(deltaData)}\n\n`),
                )
              }
              break
            }

            case "tool_call_start": {
              // Close the current text output item if we had text
              closeMessageItem()

              // Add function call output item at the current outputIndex, then advance
              const fcOutputIndex = outputIndex
              outputIndex++
              toolCallArgs.set(event.tool_call.id, {
                name: event.tool_call.name,
                args: "",
                outputIndex: fcOutputIndex,
              })
              const fcAddedData = {
                type: "response.output_item.added",
                output_index: fcOutputIndex,
                item: {
                  type: "function_call",
                  id: `fc_${fcOutputIndex}`,
                  call_id: event.tool_call.id,
                  name: event.tool_call.name,
                  arguments: "",
                  status: "in_progress",
                },
              }
              controller.enqueue(
                sseEncode(`event: response.output_item.added\ndata: ${JSON.stringify(fcAddedData)}\n\n`),
              )
              break
            }

            case "tool_call_delta": {
              const tc = toolCallArgs.get(event.tool_call.id)
              if (tc) {
                tc.args += event.tool_call.arguments_delta
              }
              const argDeltaData = {
                type: "response.function_call_arguments.delta",
                output_index: tc?.outputIndex ?? 0,
                delta: event.tool_call.arguments_delta,
              }
              controller.enqueue(
                sseEncode(`event: response.function_call_arguments.delta\ndata: ${JSON.stringify(argDeltaData)}\n\n`),
              )
              break
            }

            case "tool_call_end": {
              const tc = toolCallArgs.get(event.tool_call.id)
              if (tc) {
                // Emit arguments done
                const argDoneData = {
                  type: "response.function_call_arguments.done",
                  output_index: tc.outputIndex,
                  arguments: tc.args,
                }
                controller.enqueue(
                  sseEncode(`event: response.function_call_arguments.done\ndata: ${JSON.stringify(argDoneData)}\n\n`),
                )
                // Emit output item done
                const itemDoneData = {
                  type: "response.output_item.done",
                  output_index: tc.outputIndex,
                  item: {
                    type: "function_call",
                    id: `fc_${tc.outputIndex}`,
                    call_id: event.tool_call.id,
                    name: tc.name,
                    arguments: tc.args,
                    status: "completed",
                  },
                }
                controller.enqueue(
                  sseEncode(`event: response.output_item.done\ndata: ${JSON.stringify(itemDoneData)}\n\n`),
                )
                toolCallArgs.delete(event.tool_call.id)
              }
              break
            }

            case "message_end": {
              // Close any remaining text output item
              closeMessageItem()

              // Emit response.completed
              const completedData: any = {
                type: "response.completed",
                response: {
                  id: responseId,
                  object: "response",
                  status: event.stop_reason === "error" ? "failed" : "completed",
                  model,
                },
              }
              if (event.usage) {
                completedData.response.usage = {
                  input_tokens: event.usage.input_tokens,
                  output_tokens: event.usage.output_tokens,
                  total_tokens:
                    event.usage.input_tokens + event.usage.output_tokens,
                }
              }
              controller.enqueue(
                sseEncode(`event: response.completed\ndata: ${JSON.stringify(completedData)}\n\n`),
              )
              break
            }

            case "error": {
              const errorData = {
                type: "error",
                error: {
                  message: event.error.message,
                  code: event.error.code || "server_error",
                },
              }
              controller.enqueue(
                sseEncode(`event: error\ndata: ${JSON.stringify(errorData)}\n\n`),
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
          error: { message: errorMessage, code: "server_error" },
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
