import { describe, expect, it } from 'vitest'
import { resolveTodoWorkspaceName } from './todo-workspace-name'

describe('resolveTodoWorkspaceName', () => {
  it('prefers workspaceName over title', () => {
    expect(resolveTodoWorkspaceName({ workspaceName: '  feat-x  ', title: 'Ignore' })).toBe(
      'feat-x'
    )
  })

  it('slugifies title when workspaceName empty', () => {
    const name = resolveTodoWorkspaceName({ workspaceName: null, title: '测试需求链路' })
    expect(name.length).toBeGreaterThan(0)
    expect(name).not.toBe('测试需求链路')
  })

  it('falls back to workspace when title slugifies empty', () => {
    expect(resolveTodoWorkspaceName({ workspaceName: '   ', title: '!!!' })).toBe('workspace')
  })
})
