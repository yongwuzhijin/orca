import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STAR_NAG_INITIAL_THRESHOLD } from '../../shared/constants'
import {
  browserWindowMock,
  checkOrcaStarredMock,
  createDeferred,
  createWindow,
  flushAsyncWork,
  getIpcHandler,
  resetStarNagServiceMocks,
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

describe('StarNagService prompt lifecycle', () => {
  let consoleInfoMock: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetStarNagServiceMocks()
    consoleInfoMock = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleInfoMock.mockRestore()
  })

  it('logs a threshold exposure exactly once while the card remains visible', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, emitAgentStarted } = createHarness()

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()
    emitAgentStarted(46)

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(consoleInfoMock).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'threshold'
    })
  })

  it('shows the browser fallback when checkOrcaStarred cannot determine star state', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    checkOrcaStarredMock.mockResolvedValue(null)
    const { service, emitAgentStarted } = createHarness()

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'web',
      surface: 'card'
    })
    expect(trackMock).toHaveBeenCalledWith('star_nag_outcome', {
      outcome: 'shown',
      source: 'threshold',
      mode: 'web',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      agents_since_baseline_bucket: '35-69',
      nth_repo_added: 3
    })
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'threshold'
    })
  })

  it('does not log a threshold exposure when checkOrcaStarred returns true', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    checkOrcaStarredMock.mockResolvedValue(true)
    const { service, emitAgentStarted } = createHarness()

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()

    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(consoleInfoMock).not.toHaveBeenCalled()
  })

  it('does not block a later real prompt after crossing the threshold with no window', async () => {
    const { service, emitAgentStarted } = createHarness()

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()

    expect(consoleInfoMock).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()

    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    emitAgentStarted(46)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 36,
      source: 'threshold'
    })
  })

  it('logs dismissal with doubled next_threshold and advances backoff for the active session', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, emitAgentStarted, ui } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    await flushAsyncWork()
    getIpcHandler('star-nag:dismiss')()

    expect(consoleInfoMock).toHaveBeenLastCalledWith({
      event: 'star_nag_dismissed',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'threshold',
      next_threshold: STAR_NAG_INITIAL_THRESHOLD * 2
    })
    expect(ui.starNagNextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD * 2)
    expect(ui.starNagBaselineAgents).toBe(45)
    expect(ui.starNagDeferredUntil).toBeGreaterThan(Date.now())
  })

  it('does not show threshold prompts while the persisted cooldown is active', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, emitAgentStarted } = createHarness({
      starNagDeferredUntil: Date.now() + 3 * 24 * 60 * 60 * 1000
    })

    service.start()
    emitAgentStarted(45)
    await flushAsyncWork()

    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(trackMock).not.toHaveBeenCalled()
  })

  it('shows agent value moment prompts once per app version after eligibility passes', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    await expect(getIpcHandler('star-nag:agentValueMoment')()).resolves.toEqual({
      status: 'ready',
      mode: 'gh'
    })
    await getIpcHandler('star-nag:showAgentValueMoment')()
    getIpcHandler('star-nag:dismiss')()
    await expect(getIpcHandler('star-nag:agentValueMoment')()).resolves.toEqual({
      status: 'skipped'
    })

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(ui.starNagAgentValueMomentAppVersion).toBe('1.2.3')
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', source: 'agent_value_moment' })
    )
  })

  it('consumes agent value moment for cooldown suppression without showing later in the same version', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness({
      starNagDeferredUntil: Date.now() + 3 * 24 * 60 * 60 * 1000
    })

    service.registerIpcHandlers()
    await expect(getIpcHandler('star-nag:agentValueMoment')()).resolves.toEqual({
      status: 'skipped'
    })
    ui.starNagDeferredUntil = null
    await expect(getIpcHandler('star-nag:agentValueMoment')()).resolves.toEqual({
      status: 'skipped'
    })

    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(ui.starNagAgentValueMomentAppVersion).toBe('1.2.3')
  })

  it('does not consume agent value moment when no window can receive the card', async () => {
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    await expect(getIpcHandler('star-nag:agentValueMoment')()).resolves.toEqual({
      status: 'ready',
      mode: 'gh'
    })
    await getIpcHandler('star-nag:showAgentValueMoment')()

    expect(ui.starNagAgentValueMomentAppVersion).toBeUndefined()

    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    await getIpcHandler('star-nag:showAgentValueMoment')()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(ui.starNagAgentValueMomentAppVersion).toBe('1.2.3')
  })

  it('shows onboarding completed prompts on the toast surface', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service } = createHarness()

    service.registerIpcHandlers()
    await getIpcHandler('star-nag:onboardingCompleted')()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'toast'
    })
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', source: 'onboarding_completed' })
    )
  })

  it('lets onboarding completed supersede an already visible threshold card', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    await getIpcHandler('star-nag:onboardingCompleted')()

    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'star-nag:hide')
    expect(window.webContents.send).toHaveBeenNthCalledWith(3, 'star-nag:show', {
      mode: 'gh',
      surface: 'toast'
    })
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', source: 'onboarding_completed' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
  })

  it('hides a superseded visible card when onboarding completion detects an existing star', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    checkOrcaStarredMock.mockResolvedValueOnce(true)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    await getIpcHandler('star-nag:onboardingCompleted')()

    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'star-nag:hide')
    expect(window.webContents.send).toHaveBeenCalledTimes(2)
    expect(ui.starNagCompleted).toBe(true)
  })

  it('queues onboarding completed while a threshold star check is in flight', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValueOnce(deferredStarCheck.promise).mockResolvedValueOnce(null)
    const { service, emitAgentStarted, ui } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    await getIpcHandler('star-nag:onboardingCompleted')()

    expect(window.webContents.send).not.toHaveBeenCalled()

    deferredStarCheck.resolve(false)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenNthCalledWith(1, 'star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(window.webContents.send).toHaveBeenNthCalledWith(2, 'star-nag:hide')
    expect(window.webContents.send).toHaveBeenNthCalledWith(3, 'star-nag:show', {
      mode: 'web',
      surface: 'toast'
    })
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', source: 'onboarding_completed', mode: 'web' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
  })

  it('queues onboarding completed while an agent value moment star check is in flight', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValueOnce(deferredStarCheck.promise).mockResolvedValueOnce(null)
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    const agentValueMoment = getIpcHandler('star-nag:agentValueMoment')()
    await getIpcHandler('star-nag:onboardingCompleted')()

    deferredStarCheck.resolve(false)
    await expect(agentValueMoment).resolves.toEqual({ status: 'ready', mode: 'gh' })
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'web',
      surface: 'toast'
    })
    expect(trackMock).toHaveBeenCalledWith(
      'star_nag_outcome',
      expect.objectContaining({ outcome: 'shown', source: 'onboarding_completed', mode: 'web' })
    )
    expect(ui.starNagCompleted).toBeUndefined()
  })

  it('allows force_show to bypass the persisted cooldown', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service } = createHarness({
      starNagDeferredUntil: Date.now() + 3 * 24 * 60 * 60 * 1000
    })

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
  })

  it('keeps the force_show source through exposure and dismissal', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:dismiss')()

    expect(consoleInfoMock).toHaveBeenNthCalledWith(1, {
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'force_show'
    })
    expect(consoleInfoMock).toHaveBeenNthCalledWith(2, {
      event: 'star_nag_dismissed',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'force_show',
      next_threshold: STAR_NAG_INITIAL_THRESHOLD * 2
    })
    expect(ui.starNagNextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD * 2)
  })

  it('does not log or block a later force_show when no window exists', () => {
    const { service } = createHarness()

    service.registerIpcHandlers()
    const forceShow = getIpcHandler('star-nag:forceShow')
    forceShow()

    expect(consoleInfoMock).not.toHaveBeenCalled()

    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    forceShow()

    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'gh',
      surface: 'card'
    })
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'force_show'
    })
  })

  it('keeps threshold source when force_show is requested during a successful threshold evaluation', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValue(deferredStarCheck.promise)
    const { service, emitAgentStarted } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    getIpcHandler('star-nag:forceShow')()

    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(consoleInfoMock).not.toHaveBeenCalled()

    deferredStarCheck.resolve(false)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'threshold'
    })
  })

  it('does not replay a stale queued force_show after threshold delivery wins', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const firstStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValueOnce(firstStarCheck.promise).mockResolvedValue(null)
    const { service, emitAgentStarted } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    getIpcHandler('star-nag:forceShow')()

    firstStarCheck.resolve(false)
    await flushAsyncWork()
    getIpcHandler('star-nag:dismiss')()

    emitAgentStarted(114)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock.mock.calls).toEqual([
      [
        {
          event: 'star_nag_shown',
          app_version: '1.2.3',
          threshold: STAR_NAG_INITIAL_THRESHOLD,
          agents_since_baseline: 35,
          source: 'threshold'
        }
      ],
      [
        {
          event: 'star_nag_dismissed',
          app_version: '1.2.3',
          threshold: STAR_NAG_INITIAL_THRESHOLD,
          agents_since_baseline: 35,
          source: 'threshold',
          next_threshold: STAR_NAG_INITIAL_THRESHOLD * 2
        }
      ]
    ])
  })

  it('does not show after completion wins an in-flight threshold evaluation', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValue(deferredStarCheck.promise)
    const { service, emitAgentStarted, ui } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:complete')()

    deferredStarCheck.resolve(false)
    await flushAsyncWork()

    expect(ui.starNagCompleted).toBe(true)
    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(consoleInfoMock).not.toHaveBeenCalled()
  })

  it('keeps threshold source when an in-flight star check falls back to the browser', async () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const deferredStarCheck = createDeferred<boolean | null>()
    checkOrcaStarredMock.mockReturnValue(deferredStarCheck.promise)
    const { service, emitAgentStarted } = createHarness()

    service.start()
    service.registerIpcHandlers()
    emitAgentStarted(45)
    getIpcHandler('star-nag:forceShow')()

    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(consoleInfoMock).not.toHaveBeenCalled()

    deferredStarCheck.resolve(null)
    await flushAsyncWork()

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock).toHaveBeenCalledTimes(1)
    expect(window.webContents.send).toHaveBeenCalledWith('star-nag:show', {
      mode: 'web',
      surface: 'card'
    })
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'threshold'
    })
  })

  it('ignores stray and duplicate dismissals without logging or advancing backoff', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, store, ui } = createHarness()

    service.registerIpcHandlers()
    const dismiss = getIpcHandler('star-nag:dismiss')
    dismiss()

    expect(consoleInfoMock).not.toHaveBeenCalled()
    expect(store.updateUI).not.toHaveBeenCalled()
    expect(ui.starNagNextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD)

    getIpcHandler('star-nag:forceShow')()
    dismiss()
    dismiss()

    const dismissedLogs = consoleInfoMock.mock.calls.filter(
      ([payload]) => (payload as { event?: string }).event === 'star_nag_dismissed'
    )
    expect(dismissedLogs).toHaveLength(1)
    expect(ui.starNagNextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD * 2)
  })

  it('marks completion without adding duplicate success logging', () => {
    const window = createWindow()
    browserWindowMock.getAllWindows.mockReturnValue([window])
    const { service, ui } = createHarness()

    service.registerIpcHandlers()
    getIpcHandler('star-nag:forceShow')()
    getIpcHandler('star-nag:complete')()

    expect(ui.starNagCompleted).toBe(true)
    expect(consoleInfoMock).toHaveBeenCalledTimes(1)
    expect(consoleInfoMock).toHaveBeenCalledWith({
      event: 'star_nag_shown',
      app_version: '1.2.3',
      threshold: STAR_NAG_INITIAL_THRESHOLD,
      agents_since_baseline: 35,
      source: 'force_show'
    })
  })
})
