import { net, session } from 'electron'
import { ensureElectronProxyFromEnvironment } from '../network/proxy-settings'
import type { TranslationFetch } from './translation-provider'

const PROXY_PROBE_URL = 'https://translate.googleapis.com/translate_a/single'

/** net.fetch ignores HTTP_PROXY/HTTPS_PROXY, so bridge them into the session proxy (#521, #800). */
export const translationFetch: TranslationFetch = async (url, init) => {
  await ensureElectronProxyFromEnvironment({
    proxySession: session.defaultSession,
    probeUrl: PROXY_PROBE_URL
  }).catch(() => {})
  return await net.fetch(url, {
    signal: init.signal,
    headers: { accept: 'application/json' }
  })
}
