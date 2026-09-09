import {
  DMONWORK_WORKTREE_DIR,
  joinRequirementPrdPath,
  joinRequirementWorktreeRoot,
  joinWorktreeRelativePath
} from './todo-requirement-worktree-paths'
import { buildAssetIndex, normalizeMarkdownImages } from './markdown-image'

export type RequirementPrdPreviewInput = {
  worktreePath: string
  prdContent: string
  assetRelativePaths: readonly string[]
}

export function prepareRequirementPrdPreviewContent(input: RequirementPrdPreviewInput): string {
  const prdPath = joinRequirementPrdPath(input.worktreePath)
  const assetPaths = input.assetRelativePaths.map((relative) =>
    joinWorktreeRelativePath(
      joinRequirementWorktreeRoot(input.worktreePath),
      relative.replace(/\\/g, '/')
    )
  )
  const assetIndex = buildAssetIndex(assetPaths)
  return normalizeMarkdownImages(input.prdContent, prdPath, assetIndex)
}

export function listRequirementAssetRelativePaths(assetNames: readonly string[]): string[] {
  return assetNames.map((name) => joinWorktreeRelativePath(DMONWORK_WORKTREE_DIR, 'assets', name))
}
