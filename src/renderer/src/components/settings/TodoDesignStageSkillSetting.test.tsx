// @vitest-environment happy-dom

import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodoDesignStageSkillSetting } from './TodoDesignStageSkillSetting'

afterEach(cleanup)

// Controlled harness: a static `value` prop would make React revert every keystroke.
function Harness({
  initial,
  onChange
}: {
  initial: string
  onChange: (next: string) => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <TodoDesignStageSkillSetting
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('TodoDesignStageSkillSetting', () => {
  it('shows the configured skill and reports edits', async () => {
    const onChange = vi.fn()
    render(<Harness initial="/ddd-requirements-analysis" onChange={onChange} />)

    const input = screen.getByTestId('todo-design-stage-skill') as HTMLInputElement
    expect(input.value).toBe('/ddd-requirements-analysis')

    await userEvent.clear(input)
    await userEvent.type(input, '/plan')
    expect(onChange).toHaveBeenLastCalledWith('/plan')
    expect(input.value).toBe('/plan')
  })

  it('reports an empty value, which disables the stage', async () => {
    const onChange = vi.fn()
    render(<Harness initial="/plan" onChange={onChange} />)

    await userEvent.clear(screen.getByTestId('todo-design-stage-skill'))
    expect(onChange).toHaveBeenLastCalledWith('')
  })
})
