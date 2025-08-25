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
  targetUrl?: string,
): InputBody<TTo> | any {
  // Convert to universal format
  const universal = toUniversal(fromProvider, body, targetUrl)

  // Change provider type
  const universalForTarget = {
    ...universal,
    provider: toProvider,
  } as unknown as UniversalBody<TTo>

  // Convert to target provider format
  return fromUniversal(toProvider, universalForTarget, targetUrl) as InputBody<TTo>
}
