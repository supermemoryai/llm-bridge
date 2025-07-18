import { describe, it, expect } from 'vitest'
import { anthropicToUniversal } from '../src/models/anthropic-format'
import { openaiToUniversal } from '../src/models/openai-format'
import { googleToUniversal } from '../src/models/google-format'
import { toUniversal } from '../src/models'

describe('Provider Format Input Validation', () => {
  describe('Anthropic Format Validation', () => {
    it('should handle undefined messages', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        // messages is undefined
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
      expect(result._original).toEqual({ provider: 'anthropic', raw: malformedBody })
    })

    it('should handle null messages', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: null,
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
    })

    it('should handle non-array messages', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: 'not an array',
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
    })

    it('should handle object instead of array for messages', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: { role: 'user', content: 'hello' },
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.messages).toEqual([])
    })

    it('should handle number instead of array for messages', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: 123,
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.messages).toEqual([])
    })

    it('should provide fallback values when model is undefined', () => {
      const malformedBody = {
        // no model or messages
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('unknown')
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
    })

    it('should provide fallback when max_tokens is undefined', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        // no max_tokens or messages
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.max_tokens).toBe(1024)
    })

    it('should handle completely empty body', () => {
      const malformedBody = {} as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('unknown')
      expect(result.messages).toEqual([])
      expect(result.max_tokens).toBe(1024)
    })

    it('should process valid messages normally when present', () => {
      const validBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'Hello world'
          }
        ],
      } as any

      const result = anthropicToUniversal(validBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[0].content[0].text).toBe('Hello world')
    })
  })

  describe('OpenAI Format Validation (Existing)', () => {
    it('should handle undefined messages (existing behavior)', () => {
      const malformedBody = {
        model: 'gpt-4',
        // messages is undefined
      } as any

      const result = openaiToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4')
      expect(result.messages).toEqual([])
    })

    it('should handle null messages (existing behavior)', () => {
      const malformedBody = {
        model: 'gpt-4',
        messages: null,
      } as any

      const result = openaiToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.messages).toEqual([])
    })

    it('should handle non-array messages (existing behavior)', () => {
      const malformedBody = {
        model: 'gpt-4',
        messages: 'not an array',
      } as any

      const result = openaiToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.messages).toEqual([])
    })
  })

  describe('Google Format Validation (Existing)', () => {
    it('should handle undefined contents (existing behavior)', () => {
      const malformedBody = {
        // contents is undefined
      } as any

      const result = googleToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
    })

    it('should handle null contents (existing behavior)', () => {
      const malformedBody = {
        contents: null,
      } as any

      const result = googleToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
    })
  })

  describe('toUniversal Integration Tests', () => {
    it('should handle malformed anthropic body through toUniversal', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        // messages is undefined
      } as any

      const result = toUniversal('anthropic', malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toEqual([])
    })

    it('should handle malformed openai body through toUniversal', () => {
      const malformedBody = {
        model: 'gpt-4',
        // messages is undefined
      } as any

      const result = toUniversal('openai', malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4')
      expect(result.messages).toEqual([])
    })

    it('should handle malformed google body through toUniversal', () => {
      const malformedBody = {
        // contents is undefined
      } as any

      const result = toUniversal('google', malformedBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toEqual([])
    })
  })

  describe('Edge Case Scenarios', () => {
    it('should handle anthropic body with messages as empty string', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: '',
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
    })

    it('should handle anthropic body with messages as boolean', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: true,
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
    })

    it('should handle anthropic body with messages as function', () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: () => 'hello',
      } as any

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
    })

    it('should handle anthropic body with circular reference', () => {
      const malformedBody: any = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
      }
      malformedBody.messages = malformedBody // circular reference

      const result = anthropicToUniversal(malformedBody)
      
      expect(result).toBeDefined()
      expect(result.messages).toEqual([])
    })
  })

  describe('Backward Compatibility', () => {
    it('should not break existing valid anthropic requests', () => {
      const validBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'Hello, how are you?'
          },
          {
            role: 'assistant',
            content: 'I am doing well, thank you!'
          }
        ],
        temperature: 0.7,
        system: 'You are a helpful assistant'
      } as any

      const result = anthropicToUniversal(validBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('anthropic')
      expect(result.model).toBe('claude-3-5-sonnet-20241022')
      expect(result.messages).toHaveLength(2)
      expect(result.messages[0].role).toBe('user')
      expect(result.messages[1].role).toBe('assistant')
      expect(result.temperature).toBe(0.7)
      expect(result.system).toBe('You are a helpful assistant')
    })

    it('should not break existing valid openai requests', () => {
      const validBody = {
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'Hello world'
          }
        ],
        temperature: 0.8
      } as any

      const result = openaiToUniversal(validBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('openai')
      expect(result.model).toBe('gpt-4')
      expect(result.messages).toHaveLength(1)
      expect(result.temperature).toBe(0.8)
    })

    it('should not break existing valid google requests', () => {
      const validBody = {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello world' }]
          }
        ]
      } as any

      const result = googleToUniversal(validBody)
      
      expect(result).toBeDefined()
      expect(result.provider).toBe('google')
      expect(result.messages).toHaveLength(1)
    })
  })
})