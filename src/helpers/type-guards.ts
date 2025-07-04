import { UniversalBody, UniversalMessage } from "../types/universal"

export function isUniversalMessage(obj: unknown): obj is UniversalMessage {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "role" in obj &&
    "content" in obj &&
    "metadata" in obj
  )
}

export function isUniversalBody(obj: unknown): obj is UniversalBody {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "provider" in obj &&
    "messages" in obj &&
    "model" in obj
  )
}
