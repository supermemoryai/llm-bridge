import { fromUniversal, toUniversal } from "."
import { InputBody, ProviderType } from "../types/providers"
import { UniversalBody } from "../types/universal"

export function translateBetweenProviders<
  TFrom extends ProviderType,
  TTo extends ProviderType,
>(
  fromProvider: TFrom,
  toProvider: TTo,
  body: InputBody<TFrom>,
): InputBody<TTo> {
  // Convert to universal format
  const universal = toUniversal(fromProvider, body)

  // Change provider type
  const universalForTarget = {
    ...universal,
    provider: toProvider,
  } as unknown as UniversalBody<TTo>

  // Convert to target provider format
  return fromUniversal(toProvider, universalForTarget)
}
