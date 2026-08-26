import { describe, expect, it } from 'vitest'
import type { TodoItem } from './todo-item'
import {
  DESIGN_DOC_SUBDIR,
  buildDesignHandoffPrompt,
  buildDesignStagePrompt,
  designDocDirRelativePath,
  isDesignStageSkillConfigured
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
  it('is a posix path under the default Orca directory keyed by identifier', () => {
    expect(designDocDirRelativePath('.orca', 'ORCA-12')).toBe('.orca/design/ORCA-12')
    expect(DESIGN_DOC_SUBDIR).toBe('design')
  })

  it('uses the configured workspace Orca directory name', () => {
    expect(designDocDirRelativePath('.tmp/orca', 'ORCA-12')).toBe('.tmp/orca/design/ORCA-12')
  })
})

describe('isDesignStageSkillConfigured', () => {
  it('treats an unset skill as not configured', () => {
    expect(isDesignStageSkillConfigured('')).toBe(false)
  })

  it('treats a whitespace-only skill as not configured, matching the prompt builder', () => {
    expect(isDesignStageSkillConfigured('   \n\t ')).toBe(false)
  })

  it('accepts a real skill, including one with stray whitespace', () => {
    expect(isDesignStageSkillConfigured('/plan')).toBe(true)
    expect(isDesignStageSkillConfigured('  /plan  ')).toBe(true)
  })
})

describe('buildDesignStagePrompt', () => {
  it('prefixes the skill and names the output directory', () => {
    const prompt = buildDesignStagePrompt(mkItem(), '/ddd-requirements-analysis', '.orca')
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
    expect(buildDesignStagePrompt(mkItem(), '   ', '.orca')).toMatch(
      /^Add a solution design stage\n/
    )
  })

  it('trims a skill that arrives with stray whitespace', () => {
    expect(buildDesignStagePrompt(mkItem(), '  /plan  ', '.orca')).toMatch(/^\/plan\n\n/)
  })

  it('drops a description that only repeats the title', () => {
    const prompt = buildDesignStagePrompt(
      mkItem({ description: 'Add a solution design stage' }),
      '',
      '.orca'
    )
    expect(prompt).toBe(
      'Add a solution design stage\n\n---\nWrite the design documents into .orca/design/ORCA-12/ in the workspace.'
    )
  })

  it('tells the design agent to write into the configured directory', () => {
    expect(buildDesignStagePrompt(mkItem(), '/plan', '.tmp/orca')).toContain(
      'Write the design documents into .tmp/orca/design/ORCA-12/ in the workspace.'
    )
  })
})

describe('buildDesignHandoffPrompt', () => {
  it('lists the design documents as relative paths, not inlined content', () => {
    expect(buildDesignHandoffPrompt(mkItem(), ['overview.md', 'api.md'], '.orca')).toBe(
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
    expect(buildDesignHandoffPrompt(mkItem(), [], '.tmp/orca')).toBe(
      'Add a solution design stage\n\nThe board needs an optional design column.'
    )
  })

  it('lists handoff documents under the configured directory', () => {
    expect(buildDesignHandoffPrompt(mkItem(), ['overview.md'], '.tmp/orca')).toContain(
      '- .tmp/orca/design/ORCA-12/overview.md'
    )
  })
})
