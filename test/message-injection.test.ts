import { describe, it, expect } from 'vitest'
import { handleUniversalRequest } from '../src/handler'
import { UniversalMessage, UniversalBody } from '../src/types/universal'

describe('Message Injection and Conversion', () => {
  it('should inject messages and convert them to provider format', async () => {
    // Mock original OpenAI request
    const originalBody = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'What is my name?'
        }
      ]
    }

    const headers = {
      'authorization': 'Bearer sk-test',
      'content-type': 'application/json'
    }

    const targetUrl = 'https://api.openai.com/v1/chat/completions'

    // Mock the edit function that injects context
    const editFunction = async (universalRequest: UniversalBody) => {
      // Simulate injecting a context message (like in your code)
      const contextMessage: UniversalMessage = {
        content: [
          {
            _original: {
              provider: universalRequest.provider,
              raw: "Here's what we know about the user: My name is Dhravya"
            },
            text: "Here's what we know about the user: My name is Dhravya",
            type: "text"
          }
        ],
        id: 'context_123',
        metadata: {
          contextInjection: true,
          provider: universalRequest.provider
        },
        role: 'system'
      }

      // Insert context message before the last message (like your code)
      const lastMessageIndex = universalRequest.messages.length - 1
      universalRequest.messages.splice(lastMessageIndex, 0, contextMessage)

      console.log('Universal request after injection:', JSON.stringify(universalRequest, null, 2))

      return {
        contextModified: true,
        request: universalRequest
      }
    }

    // Mock fetch to capture the final request
    let capturedRequest: any = null
    const mockFetch = async (url: string, options: any) => {
      capturedRequest = {
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body)
      }
      
      // Return mock OpenAI response
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Your name is Dhravya.'
          }
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    // Mock global fetch
    global.fetch = mockFetch

    try {
      const response = await handleUniversalRequest(
        targetUrl,
        originalBody,
        headers,
        'POST',
        editFunction,
        { enableObservability: true }
      )

      console.log('Captured request body:', JSON.stringify(capturedRequest?.body, null, 2))

      // Verify the request was made
      expect(capturedRequest).toBeTruthy()
      expect(capturedRequest.body).toBeTruthy()
      expect(capturedRequest.body.messages).toBeTruthy()

      // Check if injected message made it to final request
      const messages = capturedRequest.body.messages
      
      // Should have 2 messages: injected context + original user message
      expect(messages).toHaveLength(2)
      
      // First message should be the injected context
      expect(messages[0]).toEqual({
        role: 'system',
        content: "Here's what we know about the user: My name is Dhravya"
      })

      // Second message should be the original user message
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'What is my name?'
      })

    } catch (error) {
      console.error('Test failed with error:', error)
      throw error
    }
  })

  it('should inject user message and convert to provider format', async () => {
    // Test injecting as user message instead of system
    const originalBody = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: 'What is my name?'
        }
      ]
    }

    const headers = {
      'authorization': 'Bearer sk-test',
      'content-type': 'application/json'
    }

    const targetUrl = 'https://api.openai.com/v1/chat/completions'

    const editFunction = async (universalRequest: UniversalBody) => {
      // Inject as user message this time
      const contextMessage: UniversalMessage = {
        content: [
          {
            _original: {
              provider: universalRequest.provider,
              raw: "Here's what we know about the user: My name is Dhravya"
            },
            text: "Here's what we know about the user: My name is Dhravya",
            type: "text"
          }
        ],
        id: 'context_123',
        metadata: {
          contextInjection: true,
          provider: universalRequest.provider
        },
        role: 'user' // Changed to user
      }

      // Add at the beginning
      universalRequest.messages.unshift(contextMessage)

      return {
        contextModified: true,
        request: universalRequest
      }
    }

    let capturedRequest: any = null
    const mockFetch = async (url: string, options: any) => {
      capturedRequest = {
        url,
        method: options.method,
        headers: options.headers,
        body: JSON.parse(options.body)
      }
      
      return new Response(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Your name is Dhravya.'
          }
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }

    global.fetch = mockFetch

    try {
      await handleUniversalRequest(
        targetUrl,
        originalBody,
        headers,
        'POST',
        editFunction,
        { enableObservability: true }
      )

      console.log('Captured request body (user injection):', JSON.stringify(capturedRequest?.body, null, 2))

      const messages = capturedRequest.body.messages
      
      // Should have 2 messages: injected context + original user message
      expect(messages).toHaveLength(2)
      
      // First message should be the injected context as user
      expect(messages[0]).toEqual({
        role: 'user',
        content: "Here's what we know about the user: My name is Dhravya"
      })

      // Second message should be the original user message
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'What is my name?'
      })

    } catch (error) {
      console.error('User injection test failed:', error)
      throw error
    }
  })
})