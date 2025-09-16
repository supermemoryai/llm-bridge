import { describe, it, expect } from 'vitest'
import { googleToUniversal } from '../src/models/google-format'
import { toUniversal } from '../src/models'

describe('Google Tools Bug Fix: TypeError: t.tools is not iterable', () => {
  describe('Original Error Scenario', () => {
    it('should handle undefined tools property without throwing', () => {
      // This is the exact scenario that caused:
      // "TypeError: t.tools is not iterable"
      // when tools property is undefined

      const bodyWithUndefinedTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'gett weather from mumbai and san francisco' }]
          }
        ],
        tools: undefined
      }

      // Before the fix, this would throw:
      // TypeError: t.tools is not iterable
      // at googleToUniversal (/src/models/google-format/index.ts:127)

      let threwError = false
      let result
      let errorMessage = ''

      try {
        result = googleToUniversal(bodyWithUndefinedTools as any)
      } catch (error: any) {
        threwError = true
        errorMessage = error.message
      }

      // After the fix, this should NOT throw an error
      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result!.provider).toBe('google')
      expect(result!.tools).toBeUndefined()
      expect(result!.messages).toHaveLength(1)
      expect(result!.messages[0].content[0].text).toBe('gett weather from mumbai and san francisco')

      // Verify the error message would have been the expected one if it threw
      if (threwError) {
        expect(errorMessage).toContain('not iterable')
      }
    })

    it('should handle null tools property without throwing', () => {
      const bodyWithNullTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: null
      }

      const result = googleToUniversal(bodyWithNullTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined()
    })

    it('should handle tools as string without throwing', () => {
      const bodyWithStringTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: 'not-an-array'
      }

      const result = googleToUniversal(bodyWithStringTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined()
    })

    it('should handle tools as number without throwing', () => {
      const bodyWithNumberTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: 42
      }

      const result = googleToUniversal(bodyWithNumberTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined()
    })

    it('should handle tools as plain object without throwing', () => {
      const bodyWithObjectTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: { someProperty: 'value' }
      }

      const result = googleToUniversal(bodyWithObjectTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined()
    })
  })

  describe('Working Tools Scenarios', () => {
    it('should still work with valid tools array', () => {
      const bodyWithValidTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'What is the weather like?' }]
          }
        ],
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Get the current weather at a location',
                parameters: {
                  type: 'object',
                  properties: {
                    latitude: { type: 'number' },
                    longitude: { type: 'number' }
                  }
                }
              }
            ]
          }
        ]
      }

      const result = googleToUniversal(bodyWithValidTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe('get_weather')
      expect(result.tools![0].description).toBe('Get the current weather at a location')
      expect(result.tools![0].parameters.properties.latitude.type).toBe('number')
    })

    it('should work with empty tools array', () => {
      const bodyWithEmptyTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: []
      }

      const result = googleToUniversal(bodyWithEmptyTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined() // Empty array results in undefined tools
    })

    it('should handle tools array with no functionDeclarations', () => {
      const bodyWithToolsNoDeclarations = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: [
          {
            // Missing functionDeclarations property
            someOtherProperty: 'value'
          }
        ]
      }

      const result = googleToUniversal(bodyWithToolsNoDeclarations as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined() // No valid function declarations results in undefined tools
    })

    it('should handle mixed valid and invalid tools', () => {
      const bodyWithMixedTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: [
          {
            // Invalid tool - no functionDeclarations
            invalidProperty: 'value'
          },
          {
            // Valid tool
            functionDeclarations: [
              {
                name: 'valid_function',
                description: 'A valid function',
                parameters: { type: 'object' }
              }
            ]
          },
          {
            // Invalid tool - empty functionDeclarations
            functionDeclarations: []
          }
        ]
      }

      const result = googleToUniversal(bodyWithMixedTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toHaveLength(1) // Only the valid tool should be extracted
      expect(result.tools![0].name).toBe('valid_function')
    })
  })

  describe('Integration with toUniversal function', () => {
    it('should work through the main toUniversal entry point with undefined tools', () => {
      const bodyWithUndefinedTools = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Test message' }]
          }
        ],
        tools: undefined
      }

      // This simulates the exact call path that would trigger the error:
      // toUniversal -> googleToUniversal
      let threwError = false
      let result

      try {
        result = toUniversal('google', bodyWithUndefinedTools as any)
      } catch (error) {
        threwError = true
      }

      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result!.provider).toBe('google')
      expect(result!.tools).toBeUndefined()
    })

    it('should work through toUniversal with the original failing scenario', () => {
      // This recreates the exact scenario from the test case that was failing
      const originalFailingBody = {
        generationConfig: {
          maxOutputTokens: undefined,
          temperature: 0,
          topK: undefined,
          topP: undefined,
          frequencyPenalty: undefined,
          presencePenalty: undefined,
          stopSequences: undefined,
          seed: undefined,
          responseMimeType: undefined,
          responseSchema: undefined,
          responseModalities: undefined,
          thinkingConfig: undefined
        },
        contents: [{ role: 'user', parts: [{ text: 'gett weather from mumbai and san francisco' }] }],
        systemInstruction: undefined,
        safetySettings: undefined,
        tools: undefined, // This was causing the error
        toolConfig: undefined,
        cachedContent: undefined
      }

      const result = toUniversal('google', originalFailingBody as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined()
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content[0].text).toBe('gett weather from mumbai and san francisco')
    })
  })

  describe('Edge Cases and Robustness', () => {
    it('should handle completely missing contents and tools', () => {
      const minimalBody = {}

      const result = googleToUniversal(minimalBody as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
      expect(result.tools).toBeUndefined()
    })

    it('should handle body with only tools property (no contents)', () => {
      const bodyOnlyTools = {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'test_function',
                description: 'Test function'
              }
            ]
          }
        ]
      }

      const result = googleToUniversal(bodyOnlyTools as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe('test_function')
    })

    it('should preserve other properties when tools is invalid', () => {
      const bodyWithOtherProperties = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        tools: 'invalid-tools',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      }

      const result = googleToUniversal(bodyWithOtherProperties as any)

      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.tools).toBeUndefined() // Invalid tools should result in undefined
      expect(result.temperature).toBe(0.7)
      expect(result.max_tokens).toBe(1024)
      expect(result.provider_params?.safety_settings).toBeDefined()
    })
  })
})
