import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, afterEach } from 'vitest'
import { DMONWORK_WORKTREE_DIR } from '../../shared/todo/todo-requirement-worktree-paths'
import { initRequirementWorktree } from './todo-requirement-worktree-service'

describe('initRequirementWorktree', () => {
  let worktreePath = ''

  afterEach(() => {
    if (worktreePath) {
      rmSync(worktreePath, { recursive: true, force: true })
      worktreePath = ''
    }
  })

  it('creates directory tree, meta, and prd stub when prdLink is set', () => {
    worktreePath = mkdtempSync(join(tmpdir(), 'orca-req-wt-'))
    initRequirementWorktree({
      worktreePath,
      todoId: 'todo-1',
      title: '测试需求',
      prdLink: 'https://alidocs.dingtalk.com/i/nodes/abc'
    })

    const root = join(worktreePath, DMONWORK_WORKTREE_DIR)
    expect(readdirSync(root).sort()).toEqual(
      [
        '_meta.json',
        'api',
        'assets',
        'clarification.json',
        'plans',
        'prd-link.txt',
        'prd.md',
        'specs'
      ].sort()
    )

    const meta = JSON.parse(readFileSync(join(root, '_meta.json'), 'utf8')) as {
      todoId: string
      parseStatus: string
    }
    expect(meta.todoId).toBe('todo-1')
    expect(meta.parseStatus).toBe('pending')

    expect(readFileSync(join(root, 'prd.md'), 'utf8')).toContain('测试需求')
    expect(readFileSync(join(root, 'prd-link.txt'), 'utf8')).toContain('alidocs.dingtalk.com')
  })

  it('skips prd files when prdLink is absent', () => {
    worktreePath = mkdtempSync(join(tmpdir(), 'orca-req-wt-'))
    initRequirementWorktree({
      worktreePath,
      todoId: 'todo-2',
      title: 'No PRD'
    })

    const root = join(worktreePath, DMONWORK_WORKTREE_DIR)
    expect(readdirSync(root)).not.toContain('prd.md')
    const meta = JSON.parse(readFileSync(join(root, '_meta.json'), 'utf8')) as {
      parseStatus: string
    }
    expect(meta.parseStatus).toBe('skipped')
  })
})
