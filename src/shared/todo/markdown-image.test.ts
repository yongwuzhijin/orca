import { describe, expect, it } from 'vitest'
import {
  buildAssetIndex,
  extractDingTalkOssImageUrls,
  normalizeMarkdownImages
} from './markdown-image'

describe('markdown-image', () => {
  it('builds asset index by filename and uuid', () => {
    const index = buildAssetIndex([
      '/wt/.dmonwork_worktree/assets/abc-1111-2222-3333-444455556666.png'
    ])
    expect(index.get('abc-1111-2222-3333-444455556666')).toBe(
      '/wt/.dmonwork_worktree/assets/abc-1111-2222-3333-444455556666.png'
    )
  })

  it('extracts dingtalk oss urls', () => {
    const urls = extractDingTalkOssImageUrls(
      '![x](https://alidocs2.oss-cn-zhangjiakou.aliyuncs.com/foo/bar.png?Expires=1)'
    )
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain('bar.png')
  })

  it('normalizes markdown image paths against asset index', () => {
    const prdPath = '/wt/.dmonwork_worktree/prd.md'
    const assetPath = '/wt/.dmonwork_worktree/assets/diagram.png'
    const index = buildAssetIndex([assetPath])
    const normalized = normalizeMarkdownImages('![d](diagram.png)', prdPath, index)
    expect(normalized).toBe(`![d](${assetPath})`)
  })
})
