import { describe, expect, it } from 'vitest'
import {
  resolveTranslationSourceLanguage,
  resolveTranslationTargetLanguage
} from './translation-target-language'

describe('resolveTranslationTargetLanguage', () => {
  it('targets English when auto-detecting Chinese input', () => {
    expect(resolveTranslationTargetLanguage('这个接口返回值被缓存了', 'auto')).toBe('en')
  })

  it('targets Chinese when auto-detecting Latin input', () => {
    expect(resolveTranslationTargetLanguage('The response was cached.', 'auto')).toBe('zh-CN')
  })

  it('targets Chinese for empty input so the direction chip has a stable default', () => {
    expect(resolveTranslationTargetLanguage('', 'auto')).toBe('zh-CN')
    expect(resolveTranslationTargetLanguage('   \n ', 'auto')).toBe('zh-CN')
  })

  it('treats mostly-English text containing one Chinese word as Chinese-bearing', () => {
    // Why: documents the known auto-detect misfire the direction override exists to fix.
    expect(resolveTranslationTargetLanguage('Set the 缓存 header please', 'auto')).toBe('en')
  })

  it('detects CJK beyond the basic ideograph block', () => {
    expect(resolveTranslationTargetLanguage('〇丨', 'auto')).toBe('en')
    expect(resolveTranslationTargetLanguage('（全角括号）', 'auto')).toBe('en')
  })

  it('ignores Latin punctuation and digits', () => {
    expect(resolveTranslationTargetLanguage('v2.1.0 — cached (200 OK)!', 'auto')).toBe('zh-CN')
  })

  it('lets an explicit preference win over detection', () => {
    expect(resolveTranslationTargetLanguage('这个接口返回值被缓存了', 'zh-CN')).toBe('zh-CN')
    expect(resolveTranslationTargetLanguage('The response was cached.', 'en')).toBe('en')
  })
})

describe('resolveTranslationSourceLanguage', () => {
  it('returns the other member of the pair', () => {
    expect(resolveTranslationSourceLanguage('en')).toBe('zh-CN')
    expect(resolveTranslationSourceLanguage('zh-CN')).toBe('en')
  })
})
