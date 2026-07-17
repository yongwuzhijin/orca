import type { TodoItem } from './todo-item'

// Why: shared by the renderer Start dialog and the main-process orchestrator so
// autonomous dispatch builds the exact same prompt a manual Start would.
export function buildBasePrompt(item: TodoItem): string {
  const title = item.title.trimEnd()
  const description = item.description.trim()
  // Why: create flow often seeds description from title; concatenating both duplicates the prompt.
  if (!description || description === title.trim()) {
    return title
  }
  return `${title}\n\n${description}`
}

export function composePrompt(base: string, extra: string): string {
  const trimmed = extra.trim()
  return trimmed ? `${base}\n\n${trimmed}` : base
}
