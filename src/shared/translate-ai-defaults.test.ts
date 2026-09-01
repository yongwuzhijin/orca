import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TRANSLATE_AI_BASE_URL,
  DEFAULT_TRANSLATE_AI_MODEL,
  resolveTranslateAiBaseUrl,
  resolveTranslateAiModel
} from './translate-ai-defaults'

describe('translate-ai-defaults', () => {
  it('falls back when missing or blank', () => {
    expect(resolveTranslateAiBaseUrl(undefined)).toBe(DEFAULT_TRANSLATE_AI_BASE_URL)
    expect(resolveTranslateAiBaseUrl('  ')).toBe(DEFAULT_TRANSLATE_AI_BASE_URL)
    expect(resolveTranslateAiModel(null)).toBe(DEFAULT_TRANSLATE_AI_MODEL)
  })

  it('keeps trimmed custom values', () => {
    expect(resolveTranslateAiBaseUrl(' https://example.com/v1 ')).toBe('https://example.com/v1')
    expect(resolveTranslateAiModel(' qwen-mt-flash ')).toBe('qwen-mt-flash')
  })
})
