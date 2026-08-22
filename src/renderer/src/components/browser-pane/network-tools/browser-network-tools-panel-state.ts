import { create } from 'zustand'
import type { BrowserApiTestHeader } from '../../../../../shared/browser-api-test-types'

export const BROWSER_NETWORK_DRAWER_MIN_HEIGHT = 180
export const BROWSER_NETWORK_DRAWER_MAX_HEIGHT = 640
const DEFAULT_HEIGHT = 280

export type BrowserNetworkToolsTab = 'rules' | 'log' | 'api'

export type BrowserApiTestPrefill = {
  method: string
  url: string
  headers: BrowserApiTestHeader[]
}

type BrowserNetworkToolsPanelState = {
  openPageId: string | null
  tab: BrowserNetworkToolsTab
  heightPx: number
  /** One-shot seed for the api tab; the tab copies it into form state and clears it. */
  apiPrefill: BrowserApiTestPrefill | null
  open: (browserPageId: string) => void
  toggle: (browserPageId: string) => void
  openApiTest: (browserPageId: string, prefill: BrowserApiTestPrefill) => void
  clearApiPrefill: () => void
  close: () => void
  setTab: (tab: BrowserNetworkToolsTab) => void
  setHeightPx: (heightPx: number) => void
}

export const useBrowserNetworkToolsPanel = create<BrowserNetworkToolsPanelState>((set, get) => ({
  openPageId: null,
  tab: 'rules',
  heightPx: DEFAULT_HEIGHT,
  apiPrefill: null,
  open: (browserPageId) => set({ openPageId: browserPageId, tab: 'rules', apiPrefill: null }),
  toggle: (browserPageId) =>
    set(
      get().openPageId === browserPageId
        ? { openPageId: null, apiPrefill: null }
        : { openPageId: browserPageId, tab: 'rules', apiPrefill: null }
    ),
  openApiTest: (browserPageId, prefill) =>
    set({ openPageId: browserPageId, tab: 'api', apiPrefill: prefill }),
  clearApiPrefill: () => set({ apiPrefill: null }),
  close: () => set({ openPageId: null, tab: 'rules', apiPrefill: null }),
  setTab: (tab) => set({ tab }),
  setHeightPx: (heightPx) =>
    set({
      heightPx: Math.min(
        BROWSER_NETWORK_DRAWER_MAX_HEIGHT,
        Math.max(BROWSER_NETWORK_DRAWER_MIN_HEIGHT, Math.round(heightPx))
      )
    })
}))
