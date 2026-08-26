import { joinPath } from '@/lib/path'
import { designDocDirRelativePath } from '../../../../../shared/todo/todo-design-prompt'

export function designDocDirAbsolutePath(
  cwd: string,
  orcaDirName: string,
  identifier: string
): string {
  return joinPath(cwd, designDocDirRelativePath(orcaDirName, identifier))
}

export function filterDesignDocNames<T extends { name: string; isDirectory: boolean }>(
  entries: readonly T[]
): string[] {
  return entries
    .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b))
}
