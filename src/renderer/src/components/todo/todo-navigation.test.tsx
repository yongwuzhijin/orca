import { describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'

describe('todos navigation', () => {
  it('openTodosPage sets activeView to todos and remembers the previous view', () => {
    const store = useAppStore.getState()
    store.setActiveView('terminal')
    store.openTodosPage()
    expect(useAppStore.getState().activeView).toBe('todos')
    useAppStore.getState().closeTodosPage()
    expect(useAppStore.getState().activeView).toBe('terminal')
  })
})
