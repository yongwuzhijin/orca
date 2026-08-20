import {
  DICTIONARY_LOOKUP_MAX_ENTRIES,
  type DictionaryHeadwordEntry
} from '../../shared/text-translation-types'

function readCode(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const code = (value as Record<string, unknown>).code
  return typeof code === 'number' && Number.isFinite(code) ? code : null
}

export function parseYoudaoDictionaryResponse(raw: unknown): DictionaryHeadwordEntry[] {
  if (typeof raw !== 'object' || raw === null) {
    return []
  }
  const body = raw as Record<string, unknown>
  const code = readCode(body.result)
  if (code !== null && code !== 200) {
    return []
  }
  const data = body.data
  if (typeof data !== 'object' || data === null) {
    return []
  }
  const entries = (data as Record<string, unknown>).entries
  if (!Array.isArray(entries)) {
    return []
  }
  const parsed: DictionaryHeadwordEntry[] = []
  const seen = new Set<string>()
  for (const candidate of entries) {
    if (parsed.length === DICTIONARY_LOOKUP_MAX_ENTRIES) {
      break
    }
    if (typeof candidate !== 'object' || candidate === null) {
      continue
    }
    const { entry, explain } = candidate as Record<string, unknown>
    if (typeof entry !== 'string' || entry === '' || seen.has(entry)) {
      continue
    }
    if (typeof explain !== 'string' || explain === '') {
      continue
    }
    seen.add(entry)
    parsed.push({ headword: entry, explain })
  }
  return parsed
}
