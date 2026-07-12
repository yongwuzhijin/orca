// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PermissionRequestCard, isAlwaysAllowOption } from './PermissionRequestCard'

afterEach(cleanup)

const req = {
  requestId: 'r1',
  sessionId: 's1',
  options: [
    { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
    { optionId: 'allow-always', name: 'Always Allow', kind: 'allow_always' },
    { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }
  ],
  toolCall: { toolCallId: 'tc1', title: 'write file', kind: 'edit' }
}

describe('isAlwaysAllowOption', () => {
  it('detects always-allow by kind or optionId', () => {
    expect(isAlwaysAllowOption({ optionId: 'allow-always', name: '', kind: 'allow_always' })).toBe(
      true
    )
    expect(isAlwaysAllowOption({ optionId: 'x', name: '', kind: 'allow_once' })).toBe(false)
  })
})

describe('PermissionRequestCard', () => {
  it('renders one button per option from params (no hardcoding)', () => {
    render(<PermissionRequestCard request={req} onResolve={vi.fn()} onSwitchAuto={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Always Allow' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('resolves with the clicked optionId', () => {
    const onResolve = vi.fn()
    render(<PermissionRequestCard request={req} onResolve={onResolve} onSwitchAuto={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(onResolve).toHaveBeenCalledWith('r1', 'allow-once')
  })

  it('switches session to auto when an always-allow option is chosen', () => {
    const onResolve = vi.fn()
    const onSwitchAuto = vi.fn()
    render(
      <PermissionRequestCard request={req} onResolve={onResolve} onSwitchAuto={onSwitchAuto} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Always Allow' }))
    expect(onResolve).toHaveBeenCalledWith('r1', 'allow-always')
    expect(onSwitchAuto).toHaveBeenCalledTimes(1)
  })
})
