export function parseWorkspaceProjectIds(raw: string | null | undefined): string[] {
  if (!raw) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
  } catch {
    return []
  }
}

export function normalizeWorkspaceProjectIds(
  ids: readonly string[] | undefined,
  primaryId: string | null | undefined
): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const id of ids ?? []) {
    if (!id || seen.has(id)) {
      continue
    }
    seen.add(id)
    normalized.push(id)
  }
  if (primaryId && !seen.has(primaryId)) {
    normalized.unshift(primaryId)
  }
  return normalized
}

export function primaryWorkspaceProjectId(
  ids: readonly string[],
  fallback: string | null | undefined
): string | null {
  return ids[0] ?? fallback ?? null
}
