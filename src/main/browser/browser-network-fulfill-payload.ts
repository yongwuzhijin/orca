import { Buffer } from 'node:buffer'
import type { BrowserNetworkResponseOverride } from '../../shared/browser-network-rule'

export type CdpFulfillPayload = {
  requestId: string
  responseCode: number
  responseHeaders: { name: string; value: string }[]
  body: string
}

export function buildCdpFulfillPayload(
  requestId: string,
  override: BrowserNetworkResponseOverride
): CdpFulfillPayload {
  return {
    requestId,
    responseCode: override.statusCode,
    // Only 'set' on the response survives: we synthesize the response from nothing, so there is no
    // upstream header to remove and a request-target mutation has already had its chance.
    responseHeaders: override.headers
      .filter((entry) => entry.target === 'response' && entry.op === 'set')
      .map((entry) => ({ name: entry.name, value: entry.value ?? '' })),
    body: Buffer.from(override.body, 'utf8').toString('base64')
  }
}
