import { describe, it, expect } from "vitest"
import { UniversalTranslationError, createTranslationError } from "../src/errors/index"

describe("UniversalTranslationError", () => {
  it("should create error with basic properties", () => {
    const error = new UniversalTranslationError(
      "Test error message",
      "TEST_CODE"
    )

    expect(error.message).toBe("Test error message")
    expect(error.code).toBe("TEST_CODE")
    expect(error.name).toBe("UniversalTranslationError")
    expect(error.provider).toBeUndefined()
    expect(error.details).toBeUndefined()
  })

  it("should create error with provider and details", () => {
    const details = { field: "value" }
    const error = new UniversalTranslationError(
      "Test error message",
      "TEST_CODE",
      "openai",
      details
    )

    expect(error.message).toBe("Test error message")
    expect(error.code).toBe("TEST_CODE")
    expect(error.name).toBe("UniversalTranslationError")
    expect(error.provider).toBe("openai")
    expect(error.details).toBe(details)
  })

  it("should be instance of Error", () => {
    const error = new UniversalTranslationError(
      "Test error message",
      "TEST_CODE"
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(UniversalTranslationError)
  })
})

describe("createTranslationError", () => {
  it("should create error with basic properties", () => {
    const error = createTranslationError(
      "Test error message",
      "TEST_CODE"
    )

    expect(error).toBeInstanceOf(UniversalTranslationError)
    expect(error.message).toBe("Test error message")
    expect(error.code).toBe("TEST_CODE")
    expect(error.provider).toBeUndefined()
    expect(error.details).toBeUndefined()
  })

  it("should create error with provider and details", () => {
    const details = { field: "value" }
    const error = createTranslationError(
      "Test error message",
      "TEST_CODE",
      "anthropic",
      details
    )

    expect(error).toBeInstanceOf(UniversalTranslationError)
    expect(error.message).toBe("Test error message")
    expect(error.code).toBe("TEST_CODE")
    expect(error.provider).toBe("anthropic")
    expect(error.details).toBe(details)
  })
})