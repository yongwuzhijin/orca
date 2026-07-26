import { vi } from 'vitest'
import { STAR_NAG_INITIAL_THRESHOLD } from '../../shared/constants'
import type { PersistedUIState } from '../../shared/types'
import type { Store } from '../persistence'
import type { StatsCollector } from '../stats/collector'
import { StarNagService } from './service'

type AgentStartedListener = (totalAgentsSpawned: number) => void

export type TestHarness = {
  service: StarNagService
  store: Store
  ui: PersistedUIState
  emitAgentStarted: (totalAgentsSpawned: number) => void
}

export function createHarness(initialUI: Partial<PersistedUIState> = {}): TestHarness {
  let totalAgentsSpawned = 45
  const listeners: AgentStartedListener[] = []
  const ui = {
    starNagAppVersion: '1.2.3',
    starNagBaselineAgents: 10,
    starNagNextThreshold: STAR_NAG_INITIAL_THRESHOLD,
    ...initialUI
  } as PersistedUIState
  const store = {
    getUI: vi.fn(() => ui),
    updateUI: vi.fn((updates: Partial<PersistedUIState>) => {
      Object.assign(ui, updates)
    })
  } as unknown as Store
  const stats = {
    onAgentStarted: vi.fn((listener: AgentStartedListener) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index !== -1) {
          listeners.splice(index, 1)
        }
      }
    }),
    getTotalAgentsSpawned: vi.fn(() => totalAgentsSpawned)
  } as unknown as StatsCollector

  return {
    service: new StarNagService(store, stats),
    store,
    ui,
    emitAgentStarted: (nextTotal: number) => {
      totalAgentsSpawned = nextTotal
      for (const listener of listeners) {
        listener(nextTotal)
      }
    }
  }
}
