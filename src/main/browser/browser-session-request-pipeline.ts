import type { Session } from 'electron'

// Why: order is a property of the key, not of registration time — settings changes re-register
// stages at arbitrary moments and must not be able to reshuffle the chain.
const STAGE_ORDER = ['certificate-guard', 'client-hints', 'network-rules', 'request-log'] as const

export type BrowserRequestStageKey = (typeof STAGE_ORDER)[number]

export type BrowserBeforeRequestStage = (
  details: Electron.OnBeforeRequestListenerDetails
) => { cancel: true } | undefined | void

export type BrowserRequestHeadersStage = (
  details: Electron.OnBeforeSendHeadersListenerDetails,
  headers: Record<string, string>
) => void

export type BrowserResponseHeadersStage = (
  details: Electron.OnHeadersReceivedListenerDetails,
  headers: Record<string, string[]>
) => void

export type BrowserCompletedStage = (details: Electron.OnCompletedListenerDetails) => void

export type BrowserErrorStage = (details: Electron.OnErrorOccurredListenerDetails) => void

type PipelineState = {
  beforeRequest: Map<BrowserRequestStageKey, BrowserBeforeRequestStage>
  requestHeaders: Map<BrowserRequestStageKey, BrowserRequestHeadersStage>
  responseHeaders: Map<BrowserRequestStageKey, BrowserResponseHeadersStage>
  completed: Map<BrowserRequestStageKey, BrowserCompletedStage>
  errored: Map<BrowserRequestStageKey, BrowserErrorStage>
}

const pipelines = new WeakMap<Session, PipelineState>()

function orderedStages<T>(stages: Map<BrowserRequestStageKey, T>): T[] {
  const ordered: T[] = []
  for (const key of STAGE_ORDER) {
    const stage = stages.get(key)
    if (stage) {
      ordered.push(stage)
    }
  }
  return ordered
}

// Why: a throwing stage must never strand a paused request — the callback has to fire regardless.
function runStage<T>(run: () => T): T | undefined {
  try {
    return run()
  } catch (error) {
    console.error('[browser.request-pipeline] stage failed', error)
    return undefined
  }
}

export function installBrowserSessionRequestPipeline(sess: Session): PipelineState {
  const existing = pipelines.get(sess)
  if (existing) {
    return existing
  }

  const state: PipelineState = {
    beforeRequest: new Map(),
    requestHeaders: new Map(),
    responseHeaders: new Map(),
    completed: new Map(),
    errored: new Map()
  }
  pipelines.set(sess, state)

  sess.webRequest.onBeforeRequest((details, callback) => {
    for (const stage of orderedStages(state.beforeRequest)) {
      if (runStage(() => stage(details))?.cancel === true) {
        callback({ cancel: true })
        return
      }
    }
    callback({})
  })

  sess.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders
    for (const stage of orderedStages(state.requestHeaders)) {
      runStage(() => stage(details, headers))
    }
    callback({ requestHeaders: headers })
  })

  sess.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = { ...details.responseHeaders }
    for (const stage of orderedStages(state.responseHeaders)) {
      runStage(() => stage(details, headers))
    }
    // Why: handing Electron an empty responseHeaders map strips the real ones off the response.
    callback(Object.keys(headers).length > 0 ? { responseHeaders: headers } : {})
  })

  sess.webRequest.onCompleted((details) => {
    for (const stage of orderedStages(state.completed)) {
      runStage(() => stage(details))
    }
  })

  sess.webRequest.onErrorOccurred((details) => {
    for (const stage of orderedStages(state.errored)) {
      runStage(() => stage(details))
    }
  })

  return state
}

function setStage<T>(
  stages: Map<BrowserRequestStageKey, T>,
  key: BrowserRequestStageKey,
  stage: T | null
): void {
  if (stage) {
    stages.set(key, stage)
  } else {
    stages.delete(key)
  }
}

export function setBrowserBeforeRequestStage(
  sess: Session,
  key: BrowserRequestStageKey,
  stage: BrowserBeforeRequestStage | null
): void {
  setStage(installBrowserSessionRequestPipeline(sess).beforeRequest, key, stage)
}

export function setBrowserRequestHeadersStage(
  sess: Session,
  key: BrowserRequestStageKey,
  stage: BrowserRequestHeadersStage | null
): void {
  setStage(installBrowserSessionRequestPipeline(sess).requestHeaders, key, stage)
}

export function setBrowserResponseHeadersStage(
  sess: Session,
  key: BrowserRequestStageKey,
  stage: BrowserResponseHeadersStage | null
): void {
  setStage(installBrowserSessionRequestPipeline(sess).responseHeaders, key, stage)
}

export function setBrowserCompletedStage(
  sess: Session,
  key: BrowserRequestStageKey,
  stage: BrowserCompletedStage | null
): void {
  setStage(installBrowserSessionRequestPipeline(sess).completed, key, stage)
}

export function setBrowserErrorStage(
  sess: Session,
  key: BrowserRequestStageKey,
  stage: BrowserErrorStage | null
): void {
  setStage(installBrowserSessionRequestPipeline(sess).errored, key, stage)
}

export function clearBrowserSessionRequestPipeline(sess: Session): void {
  if (!pipelines.delete(sess)) {
    return
  }
  sess.webRequest.onBeforeRequest(null)
  sess.webRequest.onBeforeSendHeaders(null)
  sess.webRequest.onHeadersReceived(null)
  sess.webRequest.onCompleted(null)
  sess.webRequest.onErrorOccurred(null)
}
