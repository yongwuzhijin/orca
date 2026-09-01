import { describe, expect, it } from 'vitest'
import {
  resolveAppearanceAccordionDeepLink,
  USAGE_PERCENTAGE_DISPLAY_SETTING_ID
} from './appearance-usage-percentage-search'
import { TRANSLATE_AI_SETTING_ID } from './appearance-translate-ai-search'

describe('resolveAppearanceAccordionDeepLink', () => {
  it('maps the usage percentage row to the Window accordion', () => {
    expect(resolveAppearanceAccordionDeepLink(USAGE_PERCENTAGE_DISPLAY_SETTING_ID)).toBe('window')
  })

  it('maps AI translation settings to the Window accordion', () => {
    expect(resolveAppearanceAccordionDeepLink(TRANSLATE_AI_SETTING_ID)).toBe('window')
  })

  it('returns null for unknown or missing section ids', () => {
    expect(resolveAppearanceAccordionDeepLink(undefined)).toBeNull()
    expect(resolveAppearanceAccordionDeepLink('something-else')).toBeNull()
  })
})
