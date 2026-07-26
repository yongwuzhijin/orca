import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAR_NAG_INITIAL_THRESHOLD } from '../../shared/constants'
import {
  browserWindowMock,
  checkOrcaStarredMock,
  createDeferred,
  createWindow,
  flushAsyncWork,
  getCohortAtEmitMock,
  getIpcHandler,
  ipcMainHandleMock,
  resetStarNagServiceMocks,
  starOrcaMock,
  trackMock
} from './service-test-mocks'
import { createHarness } from './service-test-harness'

// Why: factories load lazily via dynamic import so the mocks module is fully
// evaluated before any factory reads its exports (see service-test-mocks.ts).
vi.mock('electron', async () => {
  const mocks = await import('./service-test-mocks')
  return {
    app: mocks.appMock,
    BrowserWindow: mocks.browserWindowMock,
    ipcMain: { handle: mocks.ipcMainHandleMock }
  }
})

vi.mock('../github/client', async () => {
  const mocks = await import('./service-test-mocks')
  return { checkOrcaStarred: mocks.checkOrcaStarredMock, starOrca: mocks.starOrcaMock }
})

vi.mock('../telemetry/client', async () => {
  const mocks = await import('./service-test-mocks')
  return { track: mocks.trackMock }
})

vi.mock('../telemetry/cohort-classifier', async () => {
  const mocks = await import('./service-test-mocks')
  return { getCohortAtEmit: mocks.getCohortAtEmitMock }
})

describe('StarNagService outcome telemetry', () => {
  let consoleInfoMock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetStarNagServiceMocks()
    consoleInfoMock = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleInfoMock.mockRestore()
  })

  it('emits shown and already_starred_suppressed outcomes with cohort context', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, emitAgentStarted } = createHarness()

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()

    expect(trackMock).toHaveBeenCalledWith('star_nag_outcome', {
      outcome: 'shown',
      source: 'threshold',
      mode: 'gh',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      agents_since_baseline_bucket: '35-69',
      nth_repo_added: 3
    })

    trackMock.mockClear()
    checkOrcaStarredMock.mockResolvedValue(true)
    const next = createHarness()
    next.service.start()
    next.emitAgentStarted(45)
    await flushAsyncWork()

    expect(trackMock).toHaveBeenCalledWith('star_nag_outcome', {
      outcome: 'already_starred_suppressed',
      source: 'threshold',
      mode: 'gh',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      agents_since_baseline_bucket: '35-69',
      nth_repo_added: 3
    })
  })

  it('emits dismissed, disabled, and opened_repo as distinct main-owned outcomes', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const dismissed = createHarness()

    dismissed.service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:dismiss')()

    expect(trackMock).toHaveBeenCalledWith('star_nag_outcome', {
      outcome: 'dismissed',
      source: 'force_show',
      mode: 'gh',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      agents_since_baseline_bucket: '35-69',
      nth_repo_added: 3,
      next_threshold: STAR_NAG_INITIAL_THRESHOLD * 2,
      cooldown_days: 3
    })

    trackMock.mockClear()
    ipcMainHandleMock.mockClear()
    const disabled = createHarness()
    disabled.service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:disable')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'disabled', mode: 'gh' })
    )

    trackMock.mockClear()
    ipcMainHandleMock.mockClear()
    const opened = createHarness()
    opened.service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:openWeb')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'opened_repo', mode: 'web' })
    )
    expect(opened.ui.starNagCompleted).toBeUndefined()
    expect(opened.ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
    expect(opened.ui.starNagNextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD * 2)
  })

  it('emits opened_repo at most once for one prompt session', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:openWeb')()
    getIpcHandler('star-nag:openWeb')()

    const openedRepoOutcomes = trackMock.mock.calls.filter(
      ([name, payload]) =>
        name === 'star_nag_outcome' && (payload as { outcome?: string }).outcome === 'opened_repo'
    )
    expect(openedRepoOutcomes).toHaveLength(1)
  })

  it('emits later cooldown outcome without completing', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const later = createHarness()

    later.service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:later')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'later', cooldown_days: 3 })
    )
    expect(consoleInfoMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ event: 'star_nag_later' })
    )
    expect(later.ui.starNagCompleted).toBeUndefined()
    expect(later.ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
  })

  it('emits direct-star attempted and succeeded outcomes plus app_starred_orca', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    const ok = await getIpcHandler('star-nag:starOrca')()

    expect(ok).toBe(true)
    expect(ui.starNagCompleted).toBe(true)
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'star_clicked', mode: 'gh' })
    )
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'direct_star_succeeded', mode: 'gh' })
    )
    expect(trackMock).toHaveBeenCalledWith('app_starred_orca', {
      source: 'star_nag',
      nth_repo_added: 3
    })
  })

  it('uses the source moment for confirmed direct-star success telemetry', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service } = createHarness()

    service.registerIpcHandlers()
    await getIpcHandler('star-nag:onboardingCompleted')()
    await getIpcHandler('star-nag:starOrca')()

    expect(trackMock).toHaveBeenCalledWith('app_starred_orca', {
      source: 'onboarding_completed',
      nth_repo_added: 3
    })
  })

  it('does not emit confirmed star telemetry for web fallback handoff', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    checkOrcaStarredMock.mockResolvedValue(null)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    await getIpcHandler('star-nag:onboardingCompleted')()
    getIpcHandler('star-nag:openWeb')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'opened_repo', source: 'onboarding_completed' })
    )
    expect(trackMock).not.toHaveBeenCalledWith(
      'app_starred_orca',
      expect.objectContaining({ source: 'onboarding_completed' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
    expect(ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
  })

  it('uses fresh cohort context for canonical app_starred_orca success telemetry', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    getCohortAtEmitMock
      .mockReturnValueOnce({ nth_repo_added: 2 })
      .mockReturnValueOnce({ nth_repo_added: 4 })
    const { service } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    await getIpcHandler('star-nag:starOrca')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', nth_repo_added: 2 })
    )
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'direct_star_succeeded', nth_repo_added: 2 })
    )
    expect(trackMock).toHaveBeenCalledWith('app_starred_orca', {
      source: 'star_nag',
      nth_repo_added: 4
    })
  })

  it('records success and completion when direct star resolves after dismissal cleared the visible session', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStar = createDeferred<boolean>()
    starOrcaMock.mockReturnValue(deferredStar.promise)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    const starPromise = getIpcHandler('star-nag:starOrca')()
    getIpcHandler('star-nag:dismiss')()

    deferredStar.resolve(true)
    await expect(starPromise).resolves.toBe(true)

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'direct_star_succeeded', mode: 'gh' })
    )
    expect(trackMock).toHaveBeenCalledWith('app_starred_orca', {
      source: 'star_nag',
      nth_repo_added: 3
    })
    expect(ui.starNagCompleted).toBe(true)
  })

  it('records failed direct star after dismissal without clearing the cooldown or re-showing', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStar = createDeferred<boolean>()
    starOrcaMock.mockReturnValue(deferredStar.promise)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    const starPromise = getIpcHandler('star-nag:starOrca')()
    getIpcHandler('star-nag:dismiss')()

    deferredStar.resolve(false)
    await expect(starPromise).resolves.toBe(false)

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'direct_star_failed', mode: 'gh' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
    expect(ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
  })

  it('clears the in-flight direct-star guard after thrown attempts so the user can retry', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    starOrcaMock.mockRejectedValueOnce(new Error('gh failed')).mockResolvedValueOnce(true)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    const starFromNag = getIpcHandler('star-nag:starOrca')

    await expect(starFromNag()).rejects.toThrow('gh failed')
    await expect(starFromNag()).resolves.toBe(true)

    expect(starOrcaMock).toHaveBeenCalledTimes(2)
    expect(ui.starNagCompleted).toBe(true)
  })

  it('records failed direct star before web fallback and guards duplicate in-flight attempts', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStar = createDeferred<boolean>()
    starOrcaMock.mockReturnValue(deferredStar.promise)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    const starFromNag = getIpcHandler('star-nag:starOrca')
    const first = starFromNag()
    const second = starFromNag()

    deferredStar.resolve(false)
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)

    const starAttempts = trackMock.mock.calls.filter(
      ([name, payload]) =>
        name === 'star_nag_outcome' && (payload as { outcome?: string }).outcome === 'star_clicked'
    )
    expect(starAttempts).toHaveLength(1)
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'direct_star_failed', mode: 'gh' })
    )

    getIpcHandler('star-nag:openWeb')()

    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'opened_repo', mode: 'web' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
    expect(ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
  })
})
