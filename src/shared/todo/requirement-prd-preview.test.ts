import { describe, expect, it } from 'vitest'
import { prepareRequirementPrdPreviewContent } from './requirement-prd-preview'

describe('prepareRequirementPrdPreviewContent', () => {
  it('rewrites relative image paths to absolute asset paths', () => {
    const content = prepareRequirementPrdPreviewContent({
      worktreePath: '/repo/feature',
      prdContent: '![diagram](assets/diagram.png)',
      assetRelativePaths: ['assets/diagram.png']
    })
    expect(content).toContain('/repo/feature/.dmonwork_worktree/assets/diagram.png')
  })
})
