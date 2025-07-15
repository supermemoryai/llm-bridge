import { describe, it, expect } from 'vitest'
import { anthropicToUniversal } from '../src/models/anthropic-format'

describe('Anthropic Format Validation', () => {
  it('should handle undefined messages gracefully', () => {
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

  it('should handle null messages gracefully', () => {
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

  it('should handle non-array messages gracefully', () => {
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

  it('should handle empty messages array normally', () => {
    const validBody = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [],
    } as any

    const result = anthropicToUniversal(validBody)
    
    expect(result).toBeDefined()
    expect(result.provider).toBe('anthropic')
    expect(result.model).toBe('claude-3-5-sonnet-20241022')
    expect(result.messages).toEqual([])
    expect(result.max_tokens).toBe(1024)
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
})