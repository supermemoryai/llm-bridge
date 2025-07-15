import { describe, it, expect } from 'vitest'
import { anthropicToUniversal } from '../src/models/anthropic-format'
import { toUniversal } from '../src/models'

describe('Bug Reproduction: Cannot read properties of undefined (reading \'map\')', () => {
  describe('Original Error Scenario', () => {
    it('should reproduce the original error context (but now fixed)', () => {
      // This is the exact type of malformed body that would cause:
      // "Cannot read properties of undefined (reading 'map')"
      // mechanism: generic
      // handled: true
      // worker.js in anthropicToUniversal at line 120507:43
      
      const malformedAnthropicBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.7,
        // Note: 'messages' property is completely missing
        // This would cause body.messages.map(...) to throw
      }

      // Before the fix, this line would throw:
      // TypeError: Cannot read properties of undefined (reading 'map')
      // at anthropicToUniversal (/src/models/anthropic-format/index.ts:96)
      
      let threwError = false
      let result
      let errorMessage = ''

      try {
        result = anthropicToUniversal(malformedAnthropicBody as any)
      } catch (error: any) {
        threwError = true
        errorMessage = error.message
      }

      // After the fix, this should NOT throw an error
      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result!.provider).toBe('anthropic')
      expect(result!.messages).toEqual([])
      expect(result!.model).toBe('claude-3-5-sonnet-20241022')
      expect(result!.max_tokens).toBe(1024)
      
      // Verify the error message would have been the expected one if it threw
      if (threwError) {
        expect(errorMessage).toContain("Cannot read properties of undefined")
        expect(errorMessage).toContain("'map'")
      }
    })

    it('should demonstrate the fix working through toUniversal entry point', () => {
      // This simulates the call path mentioned in the error:
      // worker.js in toUniversal at line 121525:14
      // worker.js in handleUniversalRequest at line 121555:21
      
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        // missing messages property
      }

      // Before fix: this would throw when toUniversal calls anthropicToUniversal
      let threwError = false
      let result

      try {
        result = toUniversal('anthropic', malformedBody as any)
      } catch (error) {
        threwError = true
      }

      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result!.provider).toBe('anthropic')
      expect(result!.messages).toEqual([])
    })
  })

  describe('Variations of the Original Bug', () => {
    it('should handle null messages (another variant)', () => {
      const bodyWithNullMessages = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: null,
      }

      const result = anthropicToUniversal(bodyWithNullMessages as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
    })

    it('should handle messages as wrong type (string)', () => {
      const bodyWithStringMessages = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: "This should be an array",
      }

      const result = anthropicToUniversal(bodyWithStringMessages as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
    })

    it('should handle messages as wrong type (number)', () => {
      const bodyWithNumberMessages = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: 42,
      }

      const result = anthropicToUniversal(bodyWithNumberMessages as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
    })

    it('should handle messages as wrong type (object)', () => {
      const bodyWithObjectMessages = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: { someProperty: 'value' },
      }

      const result = anthropicToUniversal(bodyWithObjectMessages as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
    })
  })

  describe('Edge Cases That Could Cause Similar Issues', () => {
    it('should handle completely empty body gracefully', () => {
      const emptyBody = {}

      const result = anthropicToUniversal(emptyBody as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('unknown')
      expect(result.max_tokens).toBe(1024)
    })

    it('should handle body with only unrelated properties', () => {
      const unrelatedBody = {
        someRandomProperty: 'value',
        anotherProperty: 123,
        yetAnotherProperty: true,
      }

      const result = anthropicToUniversal(unrelatedBody as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('unknown')
      expect(result.max_tokens).toBe(1024)
    })

    it('should provide sensible defaults for missing required fields', () => {
      const partialBody = {
        // model is missing
        // max_tokens is missing  
        // messages is missing
        temperature: 0.5,
        top_p: 0.9,
      }

      const result = anthropicToUniversal(partialBody as any)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('unknown')
      expect(result.max_tokens).toBe(1024)
      // Note: temperature and top_p are not preserved in the early return for malformed input
      // This is acceptable as the input was malformed
    })
  })

  describe('Comparison with Working Providers', () => {
    it('should confirm OpenAI already had this protection', () => {
      // OpenAI format already had the validation logic we added to Anthropic
      const malformedOpenAIBody = {
        model: 'gpt-4',
        // messages missing
      }

      // This should work because OpenAI already had: 
      // if (!body.messages || !Array.isArray(body.messages)) { ... }
      const result = toUniversal('openai', malformedOpenAIBody as any)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.messages).toEqual([])
    })

    it('should confirm Google already had this protection', () => {
      // Google format already used: (body.contents || []).map(...)
      const malformedGoogleBody = {
        // contents missing
      }

      const result = toUniversal('google', malformedGoogleBody as any)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
    })
  })

  describe('Backwards Compatibility Verification', () => {
    it('should still work with valid Anthropic requests', () => {
      const validAnthropicBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'Hello, Claude!'
          },
          {
            role: 'assistant', 
            content: 'Hello! How can I help you today?'
          }
        ],
        temperature: 0.7,
        system: 'You are a helpful assistant.'
      }

      const result = anthropicToUniversal(validAnthropicBody as any)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[1].role).toBe('assistant')
      expect(result.messages[0].content[0].text).toBe('Hello, Claude!')
      expect(result.messages[1].content[0].text).toBe('Hello! How can I help you today?')
      expect(result.temperature).toBe(0.7)
      expect(result.system).toBe('You are a helpful assistant.')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.max_tokens).toBe(1024)
    })

    it('should work with complex Anthropic requests including tools', () => {
      const complexAnthropicBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather like?'
          }
        ],
        tools: [
          {
            name: 'get_weather',
            description: 'Get current weather information',
            input_schema: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              }
            }
          }
        ],
        tool_choice: { type: 'auto' }
      }

      const result = anthropicToUniversal(complexAnthropicBody as any)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.messages).toHaveLength(1)
      expect(result.tools).toHaveLength(1)
      expect(result.tools![0].name).toBe('get_weather')
      // Note: tool_choice format is preserved correctly through the normal processing path
      expect(result.tool_choice).toBe('auto')
    })
  })
})