// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

import { TranslateDictionaryLookupSetting } from './TranslateDictionaryLookupSetting'

afterEach(cleanup)

function renderSetting(translateDictionaryLookupEnabled: boolean | undefined) {
  const updateSettings = vi.fn()
  render(
    <TranslateDictionaryLookupSetting
      settings={{ translateDictionaryLookupEnabled }}
      updateSettings={updateSettings}
    />
  )
  return { updateSettings, toggle: screen.getByRole('switch') }
}

describe('TranslateDictionaryLookupSetting', () => {
  it('reads as on for profiles saved before the preference existed', () => {
    expect(renderSetting(undefined).toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('reads as off once the lookup was opted out of', () => {
    expect(renderSetting(false).toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('names the third-party host so the opt-out is an informed one', () => {
    renderSetting(true)
    expect(screen.getByText(/dict\.youdao\.com/)).toBeTruthy()
  })

  it('persists the opt-out', () => {
    const { updateSettings, toggle } = renderSetting(true)
    fireEvent.click(toggle)
    expect(updateSettings).toHaveBeenCalledWith({ translateDictionaryLookupEnabled: false })
  })

  it('persists turning the lookup back on', () => {
    const { updateSettings, toggle } = renderSetting(false)
    fireEvent.click(toggle)
    expect(updateSettings).toHaveBeenCalledWith({ translateDictionaryLookupEnabled: true })
  })
})
