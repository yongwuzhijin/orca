import { describe, expect, it } from 'vitest'
import { presentAcpToolCall } from './acp-tool-presentation'

describe('presentAcpToolCall', () => {
  it('classifies edit payloads and counts changed lines', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'edit-1',
        title: 'Edit',
        toolKind: 'edit',
        rawInput: { path: 'src/a.ts', old_string: 'old', new_string: 'new\nline' }
      })
    ).toMatchObject({ kind: 'file', path: 'src/a.ts', added: 2, removed: 1 })
  })

  it('classifies bash payloads and extracts output', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'bash-1',
        title: 'Bash',
        toolKind: 'execute',
        rawInput: { command: 'pnpm test' },
        content: { output: 'PASS' }
      })
    ).toMatchObject({ kind: 'command', command: 'pnpm test', output: 'PASS' })
  })

  it('does not classify an agent word in a command title as a subagent', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'agent-command-1',
        title: 'Agent Command',
        toolKind: 'execute',
        rawInput: { command: 'pnpm test' }
      })
    ).toMatchObject({ kind: 'command', command: 'pnpm test' })
  })

  it('falls back to formatted generic detail', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'x',
        title: 'Skill',
        rawInput: { name: 'review' }
      })
    ).toMatchObject({ kind: 'generic', detail: '{\n  "name": "review"\n}' })
  })

  it('prefers readable generic content over raw input without quoting strings', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'generic-content-1',
        title: 'Skill',
        rawInput: { name: 'review' },
        content: 'Review completed'
      })
    ).toMatchObject({ kind: 'generic', detail: 'Review completed' })
  })

  it('falls back to generic raw input when content has no readable text', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'generic-content-2',
        title: 'Skill',
        rawInput: { name: 'review' },
        content: {}
      })
    ).toMatchObject({ kind: 'generic', detail: '{\n  "name": "review"\n}' })
  })

  it('classifies a subagent run and extracts its display metadata', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'agent-1',
        title: 'Subagent',
        toolKind: 'task',
        status: 'running',
        rawInput: {
          description: '实现 ACP 时间线',
          model: 'GPT-5.6 Sol Medium',
          prompt: '实现并验证时间线'
        },
        content: { output: '2 个测试文件全部通过' }
      })
    ).toMatchObject({
      kind: 'subagent',
      title: '实现 ACP 时间线',
      model: 'GPT-5.6 Sol Medium',
      stage: '实现并验证时间线',
      result: '2 个测试文件全部通过'
    })
  })

  it('parses unified diff text into display lines and counts', () => {
    const diff = [
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
      ' same'
    ].join('\n')
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'patch-1',
        title: 'apply_patch',
        rawInput: { file_path: 'src/a.ts', patch: diff }
      })
    ).toEqual({
      kind: 'file',
      title: 'apply_patch',
      path: 'src/a.ts',
      added: 1,
      removed: 1,
      lines: [
        { kind: 'meta', text: '--- a/src/a.ts' },
        { kind: 'meta', text: '+++ b/src/a.ts' },
        { kind: 'meta', text: '@@ -1,2 +1,2 @@' },
        { kind: 'del', text: '-old' },
        { kind: 'add', text: '+new' },
        { kind: 'context', text: ' same' }
      ]
    })
  })

  it('parses a unified diff supplied as the entire tool input', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'patch-2',
        title: 'apply_patch',
        rawInput: '@@ -1 +1 @@\n-before\n+after'
      })
    ).toMatchObject({ kind: 'file', path: null, added: 1, removed: 1 })
  })

  it('does not append a blank context line for a terminated unified diff', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'patch-3',
        title: 'apply_patch',
        rawInput: { patch: '@@ -1 +1 @@\n-before\n+after\n' }
      })
    ).toMatchObject({
      kind: 'file',
      lines: [
        { kind: 'meta', text: '@@ -1 +1 @@' },
        { kind: 'del', text: '-before' },
        { kind: 'add', text: '+after' }
      ]
    })
  })

  it('reads string command content as output', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'shell-1',
        title: 'Shell',
        rawInput: { cmd: 'pwd' },
        content: 'workspace'
      })
    ).toMatchObject({ kind: 'command', command: 'pwd', output: 'workspace' })
  })

  it('degrades a malformed title-only file payload to generic raw details', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'write-1',
        title: 'Write',
        rawInput: { path: 42, old: null, content: ['not', 'text'] }
      })
    ).toEqual({
      kind: 'generic',
      title: 'Write',
      detail: '{\n  "path": 42,\n  "old": null,\n  "content": [\n    "not",\n    "text"\n  ]\n}'
    })
  })

  it('does not count trailing newlines as changed lines', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'edit-2',
        title: 'Edit',
        rawInput: { old_string: 'a\n', new_string: 'b\n' }
      })
    ).toMatchObject({
      kind: 'file',
      added: 1,
      removed: 1,
      lines: [
        { kind: 'del', text: '-a' },
        { kind: 'add', text: '+b' }
      ]
    })
  })

  it('does not throw when generic input contains a cycle', () => {
    const rawInput: Record<string, unknown> = { name: 'cyclic' }
    rawInput.self = rawInput

    expect(() =>
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'cyclic-1',
        title: 'Skill',
        rawInput
      })
    ).not.toThrow()
  })

  it('handles missing commands and recursively extracts content-block output', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'terminal-1',
        title: 'Terminal',
        rawInput: { command: false },
        content: { content: [{ type: 'text', text: 'done' }] }
      })
    ).toMatchObject({ kind: 'command', command: null, output: 'done' })
  })

  it('degrades a malformed title-only command payload to generic raw details', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'bash-malformed-1',
        title: 'Bash',
        rawInput: { command: false, cwd: '/workspace' },
        content: {}
      })
    ).toEqual({
      kind: 'generic',
      title: 'Bash',
      detail: '{\n  "command": false,\n  "cwd": "/workspace"\n}'
    })
  })

  it('prioritizes subagent recognition over command-shaped payloads', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'agent-2',
        title: 'Task',
        toolKind: 'execute',
        rawInput: { subagent_type: 'implementer', name: 'Task 2', command: 'pnpm test' },
        content: { result: '完成' }
      })
    ).toMatchObject({ kind: 'subagent', title: 'Task 2', result: '完成' })
  })

  it('prioritizes subagent recognition over file-shaped payloads', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'agent-3',
        title: 'Subagent',
        toolKind: 'edit',
        rawInput: {
          description: '实现解析器',
          path: 'src/a.ts',
          old_string: 'before',
          new_string: 'after'
        }
      })
    ).toMatchObject({ kind: 'subagent', title: '实现解析器' })
  })

  it('prioritizes file recognition over command-shaped payloads', () => {
    expect(
      presentAcpToolCall({
        kind: 'tool_call',
        toolCallId: 'edit-command-1',
        title: 'Edit',
        toolKind: 'execute',
        rawInput: {
          path: 'src/a.ts',
          old_string: 'before',
          new_string: 'after',
          command: 'replace'
        }
      })
    ).toMatchObject({ kind: 'file', path: 'src/a.ts' })
  })
})
