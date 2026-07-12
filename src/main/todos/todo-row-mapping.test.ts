import { describe, expect, it } from 'vitest'

import { rowToProject } from './todo-row-mapping'

describe('rowToProject', () => {
  it('maps default_working_dir on projects (P2b)', () => {
    const project = rowToProject({
      id: 'p1',
      name: 'P',
      identifier_prefix: 'P',
      next_sequence: 1,
      default_working_dir: '/tmp/work',
      created_at: 't',
      updated_at: 't'
    })
    expect(project.defaultWorkingDir).toBe('/tmp/work')
  })
})
