import {
  normalizeAgentStatusPayload,
  type ParsedAgentStatusPayload
} from '../../agent-status-types'
import type { HookListenerState } from '../listener-state'
import { resolvePrompt, resolveToolState } from '../prompt-fields'
import { extractToolFields, isNewTurnEvent } from '../provider-event-routing'

function cursorDeliveredAssistantMessage(
  snapshotMessage: string | null | undefined,
  previousStatus: ParsedAgentStatusPayload | undefined
): string | null {
  const fromSnapshot = snapshotMessage?.trim()
  if (fromSnapshot) {
    return fromSnapshot
  }
  const fromPrevious = previousStatus?.lastAssistantMessage?.trim()
  return fromPrevious || null
}

// Why: Cursor stop.status is not only user cancellation — post-stream cleanup can emit
// `error` after the answer is already on screen (e.g. WritableIterable is closed).
export function isCursorStopInterrupted(
  status: unknown,
  deliveredAssistantMessage: string | null
): boolean | undefined {
  if (typeof status !== 'string' || status === 'completed') {
    return undefined
  }
  if (status === 'cancelled' || status === 'aborted') {
    return true
  }
  if (deliveredAssistantMessage) {
    return undefined
  }
  return true
}

export function normalizeCursorEvent(
  state: HookListenerState,
  eventName: unknown,
  promptText: string,
  paneKey: string,
  hookPayload: Record<string, unknown>
): ParsedAgentStatusPayload | null {
  // Why: Cursor can emit final response text after `stop`; enrich the completed row, don't resurrect the agent as working.
  const previousStatus = state.lastStatusByPaneKey.get(paneKey)?.payload
  const stateName =
    eventName === 'beforeSubmitPrompt' ||
    eventName === 'sessionStart' ||
    eventName === 'preToolUse' ||
    eventName === 'postToolUse' ||
    eventName === 'postToolUseFailure' ||
    // Why: these fire on every shell/MCP invocation (pre-execution gates, not just approval); treat as working to avoid waiting-notification spam.
    eventName === 'beforeShellExecution' ||
    eventName === 'beforeMCPExecution'
      ? 'working'
      : eventName === 'afterAgentResponse'
        ? previousStatus?.state === 'done' && previousStatus.agentType === 'cursor'
          ? 'done'
          : 'working'
        : eventName === 'stop' || eventName === 'sessionEnd'
          ? 'done'
          : null

  if (!stateName) {
    return null
  }

  const snapshot = resolveToolState(
    state,
    paneKey,
    extractToolFields('cursor', eventName, hookPayload),
    { resetOnNewTurn: isNewTurnEvent('cursor', eventName) }
  )

  const interrupted =
    eventName === 'stop'
      ? isCursorStopInterrupted(
          hookPayload.status,
          cursorDeliveredAssistantMessage(snapshot.lastAssistantMessage, previousStatus)
        )
      : undefined

  return normalizeAgentStatusPayload({
    state: stateName,
    prompt: resolvePrompt(state, paneKey, promptText, {
      resetOnNewTurn: isNewTurnEvent('cursor', eventName)
    }),
    agentType: 'cursor',
    toolName: snapshot.toolName,
    toolInput: snapshot.toolInput,
    interactivePrompt: snapshot.interactivePrompt,
    lastAssistantMessage: snapshot.lastAssistantMessage,
    interrupted
  })
}
