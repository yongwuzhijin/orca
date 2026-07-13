// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { TodoDashboard } from './TodoDashboard'
import type { TodoDashboardMetrics } from '../../../../../shared/todo/todo-dashboard'

vi.mock('./ThroughputChart', () => ({ ThroughputChart: () => <div data-testid="throughput" /> }))
vi.mock('./EstimateAccuracyChart', () => ({
  EstimateAccuracyChart: () => <div data-testid="estimate" />
}))
vi.mock('./CycleTimeCard', () => ({ CycleTimeCard: () => <div data-testid="cycle" /> }))
vi.mock('./TokenCostCard', () => ({ TokenCostCard: () => <div data-testid="token" /> }))

function metrics(overrides: Partial<TodoDashboardMetrics> = {}): TodoDashboardMetrics {
  return {
    projectId: 'p1',
    range: '30d',
    generatedAt: 1,
    doneTaskCount: 2,
    throughput: [],
    cycleTime: { averageMs: null, medianMs: null, samples: [] },
    tokenCost: {
      totalTokens: 0,
      estimatedCostUsd: 0,
      knownTaskCount: 0,
      unavailableTaskCount: 0,
      perTask: []
    },
    estimateAccuracy: [],
    ...overrides
  }
}

function setApi(getMetrics: ReturnType<typeof vi.fn>): void {
  ;(window as unknown as { api: unknown }).api = { todos: { dashboard: { getMetrics } } }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TodoDashboard', () => {
  it('renders charts once metrics load', async () => {
    const getMetrics = vi.fn(async () => metrics())
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.getByTestId('throughput')).toBeInTheDocument())
    expect(getMetrics).toHaveBeenCalledWith({ projectId: 'p1', range: '30d' })
  })

  it('shows empty state when there are no done tasks', async () => {
    setApi(vi.fn(async () => metrics({ doneTaskCount: 0 })))
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.queryByTestId('throughput')).not.toBeInTheDocument())
    expect(screen.getByText(/no completed tasks/i)).toBeInTheDocument()
  })

  it('refetches when the range changes', async () => {
    const getMetrics = vi.fn(async () => metrics())
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(getMetrics).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByText('7d'))
    await waitFor(() => expect(getMetrics).toHaveBeenCalledWith({ projectId: 'p1', range: '7d' }))
  })

  it('shows an error state with a retry button when the call rejects', async () => {
    const getMetrics = vi.fn<() => Promise<TodoDashboardMetrics>>(async () => {
      throw new Error('boom')
    })
    setApi(getMetrics)
    render(<TodoDashboard projectId="p1" />)
    await waitFor(() => expect(screen.getByText(/retry/i)).toBeInTheDocument())
    getMetrics.mockResolvedValueOnce(metrics())
    fireEvent.click(screen.getByText(/retry/i))
    await waitFor(() => expect(screen.getByTestId('throughput')).toBeInTheDocument())
  })
})
