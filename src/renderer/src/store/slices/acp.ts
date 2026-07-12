import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { AcpEngine } from '../../../../shared/acp/acp-session'
import type {
  PermissionRequest,
  PlanEntry,
  SessionEvent
} from '../../../../shared/acp/session-event'
import { mapSessionUpdate } from './acp-session-event-mapping'

export type AcpSessionStatus = 'running' | 'complete' | 'error' | 'canceled'
type PermissionMode = 'auto' | 'ask'

export type ExecuteTaskInput = {
  taskId: string
  engine: AcpEngine
  prompt: string
  cwd: string
  resumeSessionId?: string
}

export type AcpSlice = {
  activeSessionByTask: Record<string, string | null>
  eventsBySession: Record<string, SessionEvent[]>
  planBySession: Record<string, PlanEntry[]>
  permissionRequestsBySession: Record<string, PermissionRequest[]>
  permissionModeBySession: Record<string, PermissionMode>
  sessionStatusBySession: Record<string, AcpSessionStatus>
  activeSessionMetaByTask: Record<string, { engine: AcpEngine; cwd: string }>

  executeTask: (input: ExecuteTaskInput) => Promise<string>
  sendFollowUp: (taskId: string, engine: AcpEngine, cwd: string, text: string) => Promise<void>
  cancelSession: (sessionId: string) => Promise<void>
  loadSessions: (taskId: string) => Promise<void>
  loadHistory: (sessionId: string) => void
  setPermissionMode: (sessionId: string, mode: PermissionMode) => Promise<void>
  resolvePermission: (sessionId: string, requestId: string, optionId: string) => Promise<void>
  subscribeSession: (sessionId: string, taskId: string) => void
}

export const createAcpSlice: StateCreator<AppState, [], [], AcpSlice> = (set, get) => {
  const subscribed = new Set<string>()

  const appendEvent = (sessionId: string, event: SessionEvent): void =>
    set((s) => ({
      eventsBySession: {
        ...s.eventsBySession,
        [sessionId]: [...(s.eventsBySession[sessionId] ?? []), event]
      }
    }))

  const ingestUpdate = (sessionId: string, payload: unknown): void => {
    const update = (payload as { update?: unknown })?.update ?? payload
    const mapped = mapSessionUpdate(update)
    if (mapped.type === 'event') {
      appendEvent(sessionId, mapped.event)
    } else if (mapped.type === 'plan') {
      set((s) => ({ planBySession: { ...s.planBySession, [sessionId]: mapped.entries } }))
    }
  }

  return {
    activeSessionByTask: {},
    eventsBySession: {},
    planBySession: {},
    permissionRequestsBySession: {},
    permissionModeBySession: {},
    sessionStatusBySession: {},
    activeSessionMetaByTask: {},

    subscribeSession: (sessionId, _taskId) => {
      if (subscribed.has(sessionId)) {
        return
      }
      subscribed.add(sessionId)
      const acp = window.api.acp
      acp.onSessionUpdate(sessionId, (p) => ingestUpdate(sessionId, p))
      acp.onUpdate(sessionId, (p) => ingestUpdate(sessionId, p))
      acp.onComplete(sessionId, () =>
        set((s) => ({
          sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'complete' },
          permissionRequestsBySession: { ...s.permissionRequestsBySession, [sessionId]: [] }
        }))
      )
      acp.onError(sessionId, () =>
        set((s) => ({
          sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'error' }
        }))
      )
      acp.onPermissionRequest(sessionId, (p) => {
        const req = p as { requestId: string; sessionId: string; params: PermissionRequest }
        const request: PermissionRequest = {
          requestId: req.requestId,
          sessionId,
          options: req.params.options,
          toolCall: req.params.toolCall
        }
        set((s) => ({
          permissionRequestsBySession: {
            ...s.permissionRequestsBySession,
            [sessionId]: [...(s.permissionRequestsBySession[sessionId] ?? []), request]
          }
        }))
      })
    },

    executeTask: async (input) => {
      const { sessionId } = (await window.api.acp.execute(input)) as { sessionId: string }
      get().subscribeSession(sessionId, input.taskId)
      set((s) => ({
        activeSessionByTask: { ...s.activeSessionByTask, [input.taskId]: sessionId },
        activeSessionMetaByTask: {
          ...s.activeSessionMetaByTask,
          [input.taskId]: { engine: input.engine, cwd: input.cwd }
        },
        sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'running' }
      }))
      return sessionId
    },

    sendFollowUp: async (taskId, engine, cwd, text) => {
      const resumeSessionId = get().activeSessionByTask[taskId] ?? undefined
      await get().executeTask({ taskId, engine, prompt: text, cwd, resumeSessionId })
    },

    cancelSession: async (sessionId) => {
      await window.api.acp.cancel({ sessionId })
      set((s) => ({
        sessionStatusBySession: { ...s.sessionStatusBySession, [sessionId]: 'canceled' }
      }))
    },

    loadSessions: async (taskId) => {
      const sessions = (await window.api.acp.listSessions({ taskId })) as {
        sessionId: string
        engine: AcpEngine
        cwd: string
      }[]
      const last = sessions.at(-1)
      const active = last?.sessionId ?? null
      if (active) {
        get().subscribeSession(active, taskId)
      }
      set((s) => ({
        activeSessionByTask: { ...s.activeSessionByTask, [taskId]: active },
        ...(last
          ? {
              activeSessionMetaByTask: {
                ...s.activeSessionMetaByTask,
                [taskId]: { engine: last.engine, cwd: last.cwd }
              }
            }
          : {})
      }))
    },

    loadHistory: (sessionId) => {
      window.api.acp.loadHistory({ sessionId })
    },

    setPermissionMode: async (sessionId, mode) => {
      await window.api.acp.setPermissionMode({ sessionId, mode })
      set((s) => ({
        permissionModeBySession: { ...s.permissionModeBySession, [sessionId]: mode }
      }))
    },

    resolvePermission: async (sessionId, requestId, optionId) => {
      await window.api.acp.resolvePermission({ requestId, optionId })
      set((s) => ({
        permissionRequestsBySession: {
          ...s.permissionRequestsBySession,
          [sessionId]: (s.permissionRequestsBySession[sessionId] ?? []).filter(
            (r) => r.requestId !== requestId
          )
        }
      }))
    }
  }
}
