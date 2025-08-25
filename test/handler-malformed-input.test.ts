import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleUniversalRequest } from '../src/handler'

// Mock fetch globally for these tests
global.fetch = vi.fn()

describe('Handler with Malformed Input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup a mock fetch response
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content: 'response' } }] })
    })
  })

  describe('Anthropic Malformed Input Handling', () => {
    it('should handle anthropic request with undefined messages without throwing', async () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        // messages is undefined - this previously caused the error
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          _original: { provider: 'anthropic', raw: malformedBody }
        },
        contextModified: false
      })

      // This should not throw the "Cannot read properties of undefined (reading 'map')" error
      expect(async () => {
        await handleUniversalRequest(
          'https://api.anthropic.com/v1/messages',
          malformedBody,
          { 'Authorization': 'Bearer test' },
          'POST',
          mockEditFunction
        )
      }).not.toThrow()

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      expect(mockEditFunction).toHaveBeenCalled()
      
      // Verify the converted request passed to editFunction has empty messages array
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
      expect(convertedRequest.provider).toBe('anthropic')
    })

    it('should handle anthropic request with null messages', async () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: null,
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          _original: { provider: 'anthropic', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
    })

    it('should handle anthropic request with non-array messages', async () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: 'not an array',
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          _original: { provider: 'anthropic', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
    })

    it('should handle completely empty anthropic body', async () => {
      const malformedBody = {}

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'unknown',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          _original: { provider: 'anthropic', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
      expect(convertedRequest.model).toBe('unknown')
    })
  })

  describe('OpenAI Malformed Input Handling (Existing)', () => {
    it('should handle openai request with undefined messages', async () => {
      const malformedBody = {
        model: 'gpt-4',
        // messages is undefined
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'gpt-4',
          messages: [],
          provider: 'openai',
          _original: { provider: 'openai', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.openai.com/v1/chat/completions',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
      expect(convertedRequest.provider).toBe('openai')
    })

    it('should handle openai request with null messages', async () => {
      const malformedBody = {
        model: 'gpt-4',
        messages: null,
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'gpt-4',
          messages: [],
          provider: 'openai',
          _original: { provider: 'openai', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.openai.com/v1/chat/completions',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
    })
  })

  describe('Google Malformed Input Handling (Existing)', () => {
    it('should handle google request with undefined contents', async () => {
      const malformedBody = {
        // contents is undefined
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          messages: [],
          provider: 'google',
          _original: { provider: 'google', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      
      const convertedRequest = mockEditFunction.mock.calls[0][0]
      expect(convertedRequest.messages).toEqual([])
      expect(convertedRequest.provider).toBe('google')
    })
  })

  describe('Error Propagation and Recovery', () => {
    it('should allow edit function to handle malformed data gracefully', async () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        // messages is undefined
      }

      const mockEditFunction = vi.fn().mockImplementation(async (request) => {
        // Simulate edit function working with the sanitized request
        expect(request.messages).toEqual([])
        expect(request.provider).toBe('anthropic')
        
        // Edit function can safely inject messages
        return {
          request: {
            ...request,
            messages: [
              {
                role: 'system',
                content: [{ type: 'text', text: 'Injected system message' }],
                id: 'injected-1',
                metadata: { contextInjection: true, provider: 'anthropic' }
              }
            ]
          },
          contextModified: true
        }
      })

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      expect(mockEditFunction).toHaveBeenCalled()
      
      // Verify the fetch was called with the transformed body
      expect(global.fetch).toHaveBeenCalled()
      const fetchCall = (global.fetch as any).mock.calls[0]
      const sentBody = JSON.parse(fetchCall[1].body)
      
      // The body should have been transformed back to Anthropic format with injected message
      expect(sentBody.messages).toBeDefined()
      expect(sentBody.messages).toHaveLength(1)
    })

    it('should preserve observability data even with malformed input', async () => {
      const malformedBody = {
        model: 'claude-3-5-sonnet-20241022',
        // missing max_tokens and messages
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          _original: { provider: 'anthropic', raw: malformedBody }
        },
        contextModified: false
      })

      const result = await handleUniversalRequest(
        'https://api.anthropic.com/v1/messages',
        malformedBody,
        { 'Authorization': 'Bearer test' },
        'POST',
        mockEditFunction,
        { enableObservability: true }
      )

      expect(result).toBeDefined()
      expect(result.response).toBeDefined()
      expect(result.observabilityData).toBeDefined()
      expect(result.observabilityData?.provider).toBe('anthropic')
    })
  })

  describe('Realistic Scenario Tests', () => {
    it('should handle the original error scenario from the bug report', async () => {
      // This simulates the exact scenario that was causing the error:
      // "Cannot read properties of undefined (reading 'map')"
      const problematicBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.7,
        // messages property is missing/undefined
      }

      const mockEditFunction = vi.fn().mockResolvedValue({
        request: {
          model: 'claude-3-5-sonnet-20241022',
          messages: [],
          provider: 'anthropic',
          max_tokens: 1024,
          temperature: 0.7,
          _original: { provider: 'anthropic', raw: problematicBody }
        },
        contextModified: false
      })

      // Before the fix, this would throw:
      // "Cannot read properties of undefined (reading 'map')"
      // at anthropicToUniversal -> body.messages.map(...)
      
      let threwError = false
      let result: any
      
      try {
        result = await handleUniversalRequest(
          'https://api.anthropic.com/v1/messages',
          problematicBody,
          { 'Authorization': 'Bearer test' },
          'POST',
          mockEditFunction
        )
      } catch (error) {
        threwError = true
        console.error('Unexpected error:', error)
      }

      expect(threwError).toBe(false)
      expect(result).toBeDefined()
      expect(result!.response).toBeDefined()
      expect(mockEditFunction).toHaveBeenCalled()
    })

    it('should handle mixed malformed data scenarios', async () => {
      const scenarios = [
        { model: 'claude-3-5-sonnet-20241022', messages: undefined },
        { model: 'claude-3-5-sonnet-20241022', messages: null },
        { model: 'claude-3-5-sonnet-20241022', messages: 'string' },
        { model: 'claude-3-5-sonnet-20241022', messages: 123 },
        { model: 'claude-3-5-sonnet-20241022', messages: {} },
        { model: 'claude-3-5-sonnet-20241022', messages: true },
        { model: 'claude-3-5-sonnet-20241022' }, // no messages
        {}, // completely empty
      ]

              for (const [index, scenario] of scenarios.entries()) {
          const mockEditFunction = vi.fn().mockResolvedValue({
            request: {
              model: (scenario as any).model || 'unknown',
              messages: [],
              provider: 'anthropic',
              max_tokens: 1024,
              _original: { provider: 'anthropic', raw: scenario }
            },
            contextModified: false
          })

        const result = await handleUniversalRequest(
          'https://api.anthropic.com/v1/messages',
          scenario,
          { 'Authorization': 'Bearer test' },
          'POST',
          mockEditFunction
        )

        expect(result, `Scenario ${index} failed`).toBeDefined()
        expect(result.response, `Scenario ${index} response failed`).toBeDefined()
        
        const convertedRequest = mockEditFunction.mock.calls[0][0]
        expect(convertedRequest.messages, `Scenario ${index} messages failed`).toEqual([])
      }
    })
  })
})