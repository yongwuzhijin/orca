// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'

afterEach(() => {
  useAppStore.setState({ todoDetailItemId: null, todoProjects: [] })
  vi.restoreAllMocks()
})

describe('todo detail navigation', () => {
  it('openTodoDetail sets the id, closeTodoDetail clears it', () => {
    useAppStore.getState().openTodoDetail('item-1')
    expect(useAppStore.getState().todoDetailItemId).toBe('item-1')
    useAppStore.getState().closeTodoDetail()
    expect(useAppStore.getState().todoDetailItemId).toBeNull()
  })

  it('updateTodoProject persists and merges the returned project', async () => {
    const updated = {
      id: 'p1',
      name: 'P1',
      identifierPrefix: 'P',
      nextSequence: 1,
      createdAt: '',
      updatedAt: '',
      defaultWorkingDir: '/w'
    }
    ;(window as unknown as { api: unknown }).api = {
      todos: { projects: { update: vi.fn().mockResolvedValue(updated) } }
    }
    useAppStore.setState({ todoProjects: [{ ...updated, defaultWorkingDir: null }] })
    await useAppStore.getState().updateTodoProject({ id: 'p1', defaultWorkingDir: '/w' })
    expect(useAppStore.getState().todoProjects[0]?.defaultWorkingDir).toBe('/w')
  })
})
