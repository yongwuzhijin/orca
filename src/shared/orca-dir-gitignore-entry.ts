function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function isOrcaDirIgnored(gitignoreContent: string, dirName: string): boolean {
  return new RegExp(`^${escapeRegExp(dirName)}/?$`, 'm').test(gitignoreContent)
}

export function appendOrcaDirIgnore(gitignoreContent: string, dirName: string): string {
  if (isOrcaDirIgnored(gitignoreContent, dirName)) {
    return gitignoreContent
  }
  const separator = gitignoreContent.length === 0 || gitignoreContent.endsWith('\n') ? '' : '\n'
  return `${gitignoreContent}${separator}${dirName}\n`
}
