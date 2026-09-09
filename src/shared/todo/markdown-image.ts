/** DingTalk OSS image host used in imported PRD markdown. */
export const DINGTALK_OSS_HOST = 'alidocs2.oss-cn-zhangjiakou.aliyuncs.com'

export const DINGTALK_OSS_IMAGE_URL_RE =
  /https?:\/\/alidocs2\.oss-cn-zhangjiakou\.aliyuncs\.com\/[^\s)"'<>]+\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s)"'<>]*)?/gi

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function imageBasename(src: string): string {
  const withoutQuery = src.split('?')[0].split('#')[0]
  const parts = withoutQuery.replace(/\\/g, '/').split('/')
  return parts.at(-1) || withoutQuery
}

export function extractUuid(name: string): string | null {
  const match = name.match(UUID_RE)
  return match ? match[0].toLowerCase() : null
}

export function buildAssetIndex(assetPaths: readonly string[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const fullPath of assetPaths) {
    const name = imageBasename(fullPath)
    index.set(name.toLowerCase(), fullPath)
    index.set(fullPath, fullPath)

    const uuid = extractUuid(name)
    if (uuid) {
      index.set(uuid, fullPath)
    }

    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    index.set(stem.toLowerCase(), fullPath)
    const stemUuid = extractUuid(stem)
    if (stemUuid) {
      index.set(stemUuid, fullPath)
    }
  }
  return index
}

export function isDingTalkOssImageUrl(src: string): boolean {
  return /^https?:\/\//i.test(src) && src.includes(DINGTALK_OSS_HOST)
}

export function extractDingTalkOssImageUrls(content: string): string[] {
  if (!content) {
    return []
  }
  const found = new Set<string>()
  for (const match of content.matchAll(DINGTALK_OSS_IMAGE_URL_RE)) {
    found.add(match[0])
  }
  return [...found]
}

export function markdownFileDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx !== -1 ? normalized.slice(0, idx) : normalized
}

export function resolveLocalImagePath(
  src: string,
  markdownFilePath: string,
  assetIndex?: ReadonlyMap<string, string>
): string {
  const cleaned = src
    .trim()
    .replace(/^["']|["']$/g, '')
    .split(/\s+/)[0]
  if (!cleaned) {
    return cleaned
  }

  const uuid = extractUuid(cleaned)
  if (uuid && assetIndex?.has(uuid)) {
    return assetIndex.get(uuid)!
  }

  const base = imageBasename(cleaned).toLowerCase()
  if (assetIndex?.has(base)) {
    return assetIndex.get(base)!
  }

  const stem = base.replace(/\.(png|jpe?g|gif|webp|bmp|svg|ico)$/, '')
  if (assetIndex?.has(stem)) {
    return assetIndex.get(stem)!
  }

  const fileDir = markdownFileDir(markdownFilePath)
  if (!cleaned.startsWith('/')) {
    return `${fileDir}/${cleaned.replace(/^\.\//, '')}`
  }
  return cleaned
}

export function normalizeMarkdownImages(
  content: string,
  markdownFilePath: string,
  assetIndex?: ReadonlyMap<string, string>
): string {
  if (!content) {
    return ''
  }
  let updated = content.replace(
    /<img([^>]*?)src=["']([^"']+)["']([^>]*)>/gi,
    (_full, _before, src) => {
      const resolved = resolveLocalImagePath(src, markdownFilePath, assetIndex)
      return `![image](${resolved})`
    }
  )

  updated = updated.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (full, alt, rawSrc) => {
    const resolved = resolveLocalImagePath(rawSrc, markdownFilePath, assetIndex)
    const raw = rawSrc
      .trim()
      .replace(/^["']|["']$/g, '')
      .split(/\s+/)[0]
    if (resolved === raw) {
      return full
    }
    return `![${alt}](${resolved})`
  })

  return updated
}
