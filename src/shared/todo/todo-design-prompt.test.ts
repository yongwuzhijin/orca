import { describe, expect, it } from 'vitest'
import type { TodoItem } from './todo-item'
import {
  DESIGN_DOC_DIR_SEGMENTS,
  buildDesignHandoffPrompt,
  buildDesignStagePrompt,
  designDocDirRelativePath
} from './todo-design-prompt'

function mkItem(overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    identifier: 'ORCA-12',
    title: 'Add a solution design stage',
    description: 'The board needs an optional design column.',
    ...overrides
  } as TodoItem
}

describe('designDocDirRelativePath', () => {
  it('is a posix path under .orca/design keyed by identifier', () => {
    expect(designDocDirRelativePath('ORCA-12')).toBe('.orca/design/ORCA-12')
    expect(DESIGN_DOC_DIR_SEGMENTS).toEqual(['.orca', 'design'])
  })
})

describe('buildDesignStagePrompt', () => {
  it('prefixes the skill and names the output directory', () => {
    const prompt = buildDesignStagePrompt(mkItem(), '/ddd-requirements-analysis')
    expect(prompt).toBe(
      [
        '/ddd-requirements-analysis',
        '',
        'Add a solution design stage',
        '',
        'The board needs an optional design column.',
        '',
        '---',
        'Write the design documents into .orca/design/ORCA-12/ in the workspace.'
      ].join('\n')
    )
  })

  it('omits the prefix when no skill is configured', () => {
    expect(buildDesignStagePrompt(mkItem(), '   ')).toMatch(/^Add a solution design stage\n/)
  })

  it('trims a skill that arrives with stray whitespace', () => {
    expect(buildDesignStagePrompt(mkItem(), '  /plan  ')).toMatch(/^\/plan\n\n/)
  })

  it('drops a description that only repeats the title', () => {
    const prompt = buildDesignStagePrompt(
      mkItem({ description: 'Add a solution design stage' }),
      ''
    )
    expect(prompt).toBe(
      'Add a solution design stage\n\n---\nWrite the design documents into .orca/design/ORCA-12/ in the workspace.'
    )
  })
})

describe('buildDesignHandoffPrompt', () => {
  it('lists the design documents as relative paths, not inlined content', () => {
    expect(buildDesignHandoffPrompt(mkItem(), ['overview.md', 'api.md'])).toBe(
      [
        'Add a solution design stage',
        '',
        'The board needs an optional design column.',
        '',
        'Implement the approved solution design. The design documents are:',
        '- .orca/design/ORCA-12/overview.md',
        '- .orca/design/ORCA-12/api.md'
      ].join('\n')
    )
  })

  it('falls back to the base prompt when the design produced nothing', () => {
    expect(buildDesignHandoffPrompt(mkItem(), [])).toBe(
      'Add a solution design stage\n\nThe board needs an optional design column.'
    )
  })
})
