export function deleteJsonNodeAt(value: unknown, segments: readonly (string | number)[]): unknown {
  const lastSegment = segments.at(-1)
  if (lastSegment === undefined) {
    throw new Error('deleteJsonNodeAt: cannot delete the root node')
  }
  // Why: one clone up front — cheap inside the 5 MiB input ceiling, and it cannot miss a shared reference.
  const next = structuredClone(value)
  let parent: unknown = next
  for (const segment of segments.slice(0, -1)) {
    parent = (parent as Record<string | number, unknown>)[segment]
  }
  if (Array.isArray(parent)) {
    parent.splice(Number(lastSegment), 1)
  } else if (parent !== null && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[String(lastSegment)]
  }
  return next
}
