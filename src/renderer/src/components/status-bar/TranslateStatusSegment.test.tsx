// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TranslateStatusSegment } from './TranslateStatusSegment'

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { recordFeatureInteraction: () => void }) => unknown) =>
    selector({ recordFeatureInteraction: () => {} })
}))

afterEach(cleanup)

describe('TranslateStatusSegment', () => {
  it('opens the popover without crashing the status bar', () => {
    render(
      <TooltipProvider>
        <TranslateStatusSegment iconOnly={false} />
      </TooltipProvider>
    )
    fireEvent.click(screen.getByLabelText('Translate text'))
    expect(screen.getByPlaceholderText(/Type or paste text/)).toBeTruthy()
  })
})
