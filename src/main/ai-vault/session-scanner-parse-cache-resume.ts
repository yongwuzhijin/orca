import { createAntigravitySessionResumeState } from './session-scanner-antigravity-parser'
import { createCodexSessionResumeState } from './session-scanner-codex-parser'
import { createDroidSessionResumeState } from './session-scanner-droid-parser'
import { createMessageGraphSessionResumeState } from './session-scanner-graph-parsers'
import { createClaudeSessionResumeState } from './session-scanner-primary-parsers'
import { createGeminiJsonlSessionResumeState } from './session-scanner-gemini-parsers'
import { createCopilotSessionResumeState } from './session-scanner-copilot-parser'
import { createCursorSessionResumeState } from './session-scanner-cursor-parser'
import { macosQoderTranscriptAgentOverride } from '../native-chat/macos-qoder-transcript-paths'
import type { ResumableSessionParseState, SessionFileCandidate } from './session-scanner-types'

export function normalizeSessionFileCandidate(
  candidate: SessionFileCandidate,
  platform: NodeJS.Platform
): SessionFileCandidate {
  const agent = macosQoderTranscriptAgentOverride(candidate.file.path, platform) ?? candidate.agent
  return agent === candidate.agent ? candidate : { ...candidate, agent }
}

// Incremental append-parsing applies only to transcripts that are append-only
// JSONL line-folds. Whole-JSON documents (grok/rovo/devin/hermes/gemini-json)
// are rewritten in place, Kimi reads a state doc plus a sibling wire file, and
// OpenCode reads SQLite rows or a doc plus a message dir — those formats keep
// unchanged-file reuse only and re-parse whole when they change.
// Returns a factory (not a state) so steady-state resumes, which clone the
// cached state instead, never pay for a throwaway accumulator.
export function resumableStateFactoryFor(
  candidate: SessionFileCandidate
): (() => ResumableSessionParseState) | null {
  switch (candidate.agent) {
    case 'claude':
      return () => createClaudeSessionResumeState(candidate.file)
    case 'qoder':
      return () => createClaudeSessionResumeState(candidate.file, 'qoder')
    case 'codex':
      return () => createCodexSessionResumeState(candidate.file, candidate.codexHome)
    case 'cursor':
      return () => createCursorSessionResumeState(candidate.file)
    case 'copilot':
      return () => createCopilotSessionResumeState(candidate.file)
    case 'droid':
      return () => createDroidSessionResumeState(candidate.file)
    case 'openclaw':
    case 'pi':
    case 'omp':
    case 'prime-agent': {
      const agent = candidate.agent
      return () => createMessageGraphSessionResumeState(agent, candidate.file)
    }
    case 'gemini':
      return candidate.file.path.endsWith('.jsonl')
        ? () => createGeminiJsonlSessionResumeState(candidate.file)
        : null
    case 'antigravity':
      return () => createAntigravitySessionResumeState(candidate.file)
    case 'devin':
    case 'grok':
    case 'hermes':
    case 'kimi':
    case 'opencode':
    case 'rovo':
      return null
  }
}
