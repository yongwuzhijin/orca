import type { TodoItem } from './todo-item'

// Why: shared by the renderer Start dialog and the main-process orchestrator so
// autonomous dispatch builds the exact same prompt a manual Start would.
export function buildBasePrompt(item: TodoItem): string {
  const title = item.title.trimEnd()
  const description = item.description.trim()
  const prdLink = item.prdLink?.trim()
  const sections: string[] = []
  // Why: create flow often seeds description from title; concatenating both duplicates the prompt.
  if (!description || description === title.trim()) {
    sections.push(title)
  } else {
    sections.push(`${title}\n\n${description}`)
  }
  if (prdLink) {
    sections.push(`PRD: ${prdLink}`)
  }
  return sections.join('\n\n')
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
}
