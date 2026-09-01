export const DEFAULT_TRANSLATE_AI_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
export const DEFAULT_TRANSLATE_AI_MODEL = 'qwen-mt-flash'

function resolveTrimmedOrDefault(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? fallback : trimmed
}

export function resolveTranslateAiBaseUrl(value: string | null | undefined): string {
  return resolveTrimmedOrDefault(value, DEFAULT_TRANSLATE_AI_BASE_URL)
}

export function resolveTranslateAiModel(value: string | null | undefined): string {
  return resolveTrimmedOrDefault(value, DEFAULT_TRANSLATE_AI_MODEL)
}
