import type { TranslationDirectionPreference, TranslationLanguage } from './text-translation-types'

// CJK ideographs + the Japanese/Korean blocks + fullwidth forms, which Chinese text
// picks up through punctuation like （） and ，.
const CJK_PATTERN = /[⺀-⿿　-〿぀-ヿ㄀-ㄯ㆐-㆟㇀-䶿一-鿿豈-﫿︰-﹏＀-￯]/

export function resolveTranslationTargetLanguage(
  text: string,
  preference: TranslationDirectionPreference
): TranslationLanguage {
  if (preference !== 'auto') {
    return preference
  }
  return CJK_PATTERN.test(text) ? 'en' : 'zh-CN'
}

export function resolveTranslationSourceLanguage(target: TranslationLanguage): TranslationLanguage {
  return target === 'en' ? 'zh-CN' : 'en'
}
