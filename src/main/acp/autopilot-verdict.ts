export type AutoPilotVerdict = { status: 'complete' | 'continue'; remaining: string | null }

// Why: no external tracker in this increment — the completion signal is the
// agent's own sentinel line. Missing sentinel is treated as "continue" so a
// forgotten marker never prematurely hands off to human review.
const SENTINEL = /^autopilot:\s*(complete|continue)\b\s*(?:[—\-:]\s*(.*))?$/i

export function parseAutoPilotVerdict(text: string): AutoPilotVerdict {
  const lines = text.split(/\r?\n/)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = SENTINEL.exec(lines[i].trim())
    if (!m) {
      continue
    }
    if (m[1].toLowerCase() === 'complete') {
      return { status: 'complete', remaining: null }
    }
    const remaining = m[2]?.trim()
    return { status: 'continue', remaining: remaining ? remaining : null }
  }
  return { status: 'continue', remaining: null }
}

export const AUTOPILOT_PROTOCOL = [
  '',
  '',
  '---',
  '【AutoPilot 协议】你正处于自主推进模式。每一轮回复的最后，请单独用一行标注状态，二选一：',
  'AUTOPILOT: COMPLETE — 当需求已推进到可交人工评审的完整状态。',
  'AUTOPILOT: CONTINUE — <一句话说明还差什么> — 当仍需继续推进。'
].join('\n')

export function composeContinuation(remaining: string | null): string {
  const mid = remaining ? `上一轮你标注仍缺：${remaining}。` : ''
  return `继续推进本需求。${mid}完成后在回复末尾按协议标注 AUTOPILOT: COMPLETE 或 AUTOPILOT: CONTINUE。`
}
