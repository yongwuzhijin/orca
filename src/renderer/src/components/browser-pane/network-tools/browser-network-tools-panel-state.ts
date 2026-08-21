import { create } from 'zustand'

export const BROWSER_NETWORK_DRAWER_MIN_HEIGHT = 180
export const BROWSER_NETWORK_DRAWER_MAX_HEIGHT = 640
const DEFAULT_HEIGHT = 280

export type BrowserNetworkToolsTab = 'rules' | 'log'

type BrowserNetworkToolsPanelState = {
  openPageId: string | null
  tab: BrowserNetworkToolsTab
  heightPx: number
  open: (browserPageId: string) => void
  toggle: (browserPageId: string) => void
  close: () => void
  setTab: (tab: BrowserNetworkToolsTab) => void
  setHeightPx: (heightPx: number) => void
}

export const useBrowserNetworkToolsPanel = create<BrowserNetworkToolsPanelState>((set, get) => ({
  openPageId: null,
  tab: 'rules',
  heightPx: DEFAULT_HEIGHT,
  open: (browserPageId) => set({ openPageId: browserPageId, tab: 'rules' }),
  toggle: (browserPageId) =>
    set(
      get().openPageId === browserPageId
        ? { openPageId: null }
        : { openPageId: browserPageId, tab: 'rules' }
    ),
  close: () => set({ openPageId: null, tab: 'rules' }),
  setTab: (tab) => set({ tab }),
  setHeightPx: (heightPx) =>
    set({
      heightPx: Math.min(
        BROWSER_NETWORK_DRAWER_MAX_HEIGHT,
        Math.max(BROWSER_NETWORK_DRAWER_MIN_HEIGHT, Math.round(heightPx))
      )
    })
}))
