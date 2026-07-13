// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ThroughputChart } from './ThroughputChart'

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})

afterEach(() => {
  cleanup()
})

describe('ThroughputChart', () => {
  it('renders without crashing when given data', () => {
    const { container } = render(<ThroughputChart data={[{ bucket: '2026-07-12', count: 3 }]} />)
    expect(container).toBeTruthy()
  })

  it('renders without crashing when data is empty', () => {
    const { container } = render(<ThroughputChart data={[]} />)
    expect(container).toBeTruthy()
  })
})
