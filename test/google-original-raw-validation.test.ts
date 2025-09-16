import { describe, it, expect } from 'vitest'
import { universalToGoogle } from '../src/models/google-format'
import { UniversalBody } from '../src/types/universal'

describe('Google _original.raw Validation Fix', () => {
  describe('Context Injection Scenarios', () => {
    it('should handle injected context messages with string _original.raw gracefully', () => {
      // This reproduces the exact scenario from the supermemory context injection
      // where _original.raw is a string instead of the expected Google object format

      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "context_123",
            metadata: {
              contextInjection: true,
              provider: "google"
            },
            content: [
              {
                type: "text",
                text: "Here's what we know about the user. Use this ONLY when necessary...",
                _original: {
                  provider: "google",
                  // This is a string, but Google expects { text: "..." }
                  raw: "Here's what we know about the user. Use this ONLY when necessary..."
                }
              }
            ]
          },
          {
            role: "user",
            id: "msg_456",
            metadata: {
              originalIndex: 0,
              provider: "google"
            },
            content: [
              {
                type: "text",
                text: "gett weather from mumbai and san francisco",
                _original: {
                  provider: "google",
                  raw: { text: "gett weather from mumbai and san francisco" }
                }
              }
            ]
          }
        ]
      }

      // Before the fix, this would throw:
      // "Invalid _original.raw format for Google provider. Expected object with 'text' property, got string"

      let threwError = false
      let result
      let errorMessage = ''

      try {
        result = universalToGoogle(universalBody)
      } catch (error: any) {
        threwError = true
        errorMessage = error.message
      }

      // After the fix, this should NOT throw an error
      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(2)

      // First message should use the text content (ignoring invalid _original)
      expect(result.contents[0].parts[0]).toEqual({
        text: "Here's what we know about the user. Use this ONLY when necessary..."
      })

      // Second message should use the valid _original format
      expect(result.contents[1].parts[0]).toEqual({
        text: "gett weather from mumbai and san francisco"
      })

      // Verify the error message would have been the expected one if it threw
      if (threwError) {
        expect(errorMessage).toContain('Invalid _original.raw format for Google provider')
      }
    })

    it('should handle mixed valid and invalid _original.raw formats', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with string _original",
                _original: {
                  provider: "google",
                  raw: "Message with string _original" // Invalid - string
                }
              }
            ]
          },
          {
            role: "user",
            id: "msg_2",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with valid _original",
                _original: {
                  provider: "google",
                  raw: { text: "Message with valid _original" } // Valid - object
                }
              }
            ]
          },
          {
            role: "user",
            id: "msg_3",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with no _original"
                // No _original field
              }
            ]
          },
          {
            role: "user",
            id: "msg_4",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with invalid object _original",
                _original: {
                  provider: "google",
                  raw: { content: "wrong format" } // Invalid - object but no 'text' property
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(4)

      // All messages should be converted to text format
      expect(result.contents[0].parts[0]).toEqual({
        text: "Message with string _original"
      })
      expect(result.contents[1].parts[0]).toEqual({
        text: "Message with valid _original"
      })
      expect(result.contents[2].parts[0]).toEqual({
        text: "Message with no _original"
      })
      expect(result.contents[3].parts[0]).toEqual({
        text: "Message with invalid object _original"
      })
    })

    it('should handle _original.raw as number gracefully', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Test message",
                _original: {
                  provider: "google",
                  raw: 42 // Invalid - number
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(1)
      expect(result.contents[0].parts[0]).toEqual({
        text: "Test message"
      })
    })

    it('should handle _original.raw as null gracefully', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Test message",
                _original: {
                  provider: "google",
                  raw: null // Invalid - null
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(1)
      expect(result.contents[0].parts[0]).toEqual({
        text: "Test message"
      })
    })
  })

  describe('Non-Google Provider _original Fields', () => {
    it('should ignore _original fields from other providers', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with OpenAI _original",
                _original: {
                  provider: "openai", // Different provider
                  raw: "This is OpenAI format"
                }
              }
            ]
          },
          {
            role: "user",
            id: "msg_2",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Message with Anthropic _original",
                _original: {
                  provider: "anthropic", // Different provider
                  raw: "This is Anthropic format"
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(2)

      // Should use the universal content, ignoring _original from other providers
      expect(result.contents[0].parts[0]).toEqual({
        text: "Message with OpenAI _original"
      })
      expect(result.contents[1].parts[0]).toEqual({
        text: "Message with Anthropic _original"
      })
    })
  })

  describe('Backwards Compatibility', () => {
    it('should still work with valid Google _original.raw objects', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Test message",
                _original: {
                  provider: "google",
                  raw: {
                    text: "Original Google format text"
                  }
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(1)

      // Should use the original Google format when valid
      expect(result.contents[0].parts[0]).toEqual({
        text: "Original Google format text"
      })
    })

    it('should work with complex Google _original objects', () => {
      const universalBody: UniversalBody<"google"> = {
        provider: "google",
        model: "gemini-1.5-pro",
        messages: [
          {
            role: "user",
            id: "msg_1",
            metadata: { provider: "google" },
            content: [
              {
                type: "text",
                text: "Test message",
                _original: {
                  provider: "google",
                  raw: {
                    text: "Google text",
                    someOtherProperty: "value"
                  }
                }
              }
            ]
          }
        ]
      }

      const result = universalToGoogle(universalBody)

      expect(result).toBeDefined()
      expect(result.contents).toHaveLength(1)

      // Should preserve the entire original object when valid
      expect(result.contents[0].parts[0]).toEqual({
        text: "Google text",
        someOtherProperty: "value"
      })
    })
  })
})
