// @vitest-environment happy-dom
// src/renderer/src/components/todo/detail/MergingPanel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MergingPanel } from './MergingPanel'
import type { TodoItem } from '../../../../../shared/todo/todo-item'
import type { MergeOutcome, MergePlan } from '../../../../../shared/todo/todo-merge'

const item = { id: 't1', status: 'merging' } as TodoItem

const updateTodoItem = vi.fn()
vi.mock('@/store', () => ({
  useAppStore: (sel: (s: unknown) => unknown) => sel({ updateTodoItem })
}))

function setApi(preview: MergePlan, execute?: MergeOutcome): void {
  ;(window as unknown as { api: unknown }).api = {
    todos: {
      merge: {
        preview: vi.fn(async () => preview),
        execute: vi.fn(async () => execute)
      }
    }
  }
}

const okPlan: MergePlan = {
  taskId: 't1',
  applicable: true,
  reason: 'ok',
  repoRoot: '/repo',
  sourceBranch: 'feature-x',
  targetBranch: 'main'
}

beforeEach(() => {
  updateTodoItem.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('MergingPanel', () => {
  it('shows source -> target after preview', async () => {
    setApi(okPlan)
    render(<MergingPanel item={item} />)
    await waitFor(() => expect(screen.getByText(/feature-x/)).toBeTruthy())
    expect(screen.getByText(/main/)).toBeTruthy()
  })

  it('merge success -> sets status done', async () => {
    setApi(okPlan, { outcome: 'merged', strategy: 'fast-forward', deletedBranch: 'feature-x' })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'done' }))
  })

  it('conflict -> sets status rework and lists files', async () => {
    setApi(okPlan, { outcome: 'conflict', conflictFiles: ['src/a.ts'] })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /merge/i }))
    fireEvent.click(screen.getByRole('button', { name: /merge/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'rework' }))
    expect(screen.getByText(/src\/a\.ts/)).toBeTruthy()
  })

  it('already-on-base -> shows mark done button', async () => {
    setApi({ ...okPlan, applicable: false, reason: 'already-on-base', sourceBranch: 'main' })
    render(<MergingPanel item={item} />)
    await waitFor(() => screen.getByRole('button', { name: /done|complete|mark/i }))
    fireEvent.click(screen.getByRole('button', { name: /done|complete|mark/i }))
    await waitFor(() => expect(updateTodoItem).toHaveBeenCalledWith('t1', { status: 'done' }))
  })
})
