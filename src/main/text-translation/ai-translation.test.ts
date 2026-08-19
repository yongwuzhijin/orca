import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'

const { resolveParamsMock, runLocalPlanMock, cancelLocalMock } = vi.hoisted(() => ({
  resolveParamsMock: vi.fn(),
  runLocalPlanMock: vi.fn(),
  cancelLocalMock: vi.fn()
}))

vi.mock('../text-generation/commit-message-text-generation', () => ({
  resolveTextGenerationParams: resolveParamsMock,
  runLocalPlanForAgent: runLocalPlanMock,
  cancelGenerateTranslationLocal: cancelLocalMock,
  commandBackslashMode: () => 'escape'
}))

import { cancelAiTranslation, translateTextWithAi } from './ai-translation'

const SETTINGS = {} as GlobalSettings
const deps = { getSettings: () => SETTINGS, cwd: '/home/tester' }

describe('translateTextWithAi', () => {
  beforeEach(() => {
    resolveParamsMock.mockReset()
    runLocalPlanMock.mockReset()
    cancelLocalMock.mockReset()
    resolveParamsMock.mockReturnValue({
      ok: true,
      params: { agentId: 'claude', model: 'sonnet' }
    })
    runLocalPlanMock.mockResolvedValue({
      success: true,
      rawOutput: 'adj. 依赖的\nn. 依赖他人者\n',
      agentLabel: 'Claude'
    })
  })

  it('returns the agent output as an ai-provider success', async () => {
    await expect(
      translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    ).resolves.toEqual({
      ok: true,
      translatedText: 'adj. 依赖的\nn. 依赖他人者',
      targetLanguage: 'zh-CN',
      detectedSourceLanguage: 'en',
      providerId: 'ai',
      dictionaryEntries: [],
      queriedText: 'dependent',
      agentLabel: 'Claude'
    })
  })

  it('asks for senses on a single word and a natural translation on a sentence', async () => {
    await translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    const wordPrompt = runLocalPlanMock.mock.calls[0][1].stdinPayload as string
    expect(wordPrompt).toContain('Simplified Chinese')
    expect(wordPrompt).toContain('single word')
    expect(wordPrompt).toContain('dependent')

    runLocalPlanMock.mockClear()
    await translateTextWithAi({ text: 'The cache was cold.', preference: 'auto' }, deps)
    const sentencePrompt = runLocalPlanMock.mock.calls[0][1].stdinPayload as string
    expect(sentencePrompt).not.toContain('single word')
    expect(sentencePrompt).toContain('one natural Simplified Chinese translation')
  })

  it('runs on the translation lane so cancelling cannot hit commit-message generation', async () => {
    await translateTextWithAi({ text: 'dependent', preference: 'auto' }, deps)
    expect(runLocalPlanMock).toHaveBeenCalledWith(
      'claude',
      expect.anything(),
      { kind: 'local', cwd: '/home/tester' },
      'translation',
      'translation'
    )
  })

  it('lowercases a shouted word the same way the free path does', async () => {
    await expect(
      translateTextWithAi({ text: 'DEPENDENT', preference: 'auto' }, deps)
    ).resolves.toMatchObject({ ok: true, queriedText: 'dependent' })
  })

  it('surfaces an unconfigured agent as ai-unavailable with the engine message', async () => {
    resolveParamsMock.mockReturnValue({ ok: false, error: 'No AI agent is configured.' })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: 'No AI agent is configured.'
    })
    expect(runLocalPlanMock).not.toHaveBeenCalled()
  })

  it('surfaces a failed run as ai-unavailable rather than falling back silently', async () => {
    runLocalPlanMock.mockResolvedValue({ success: false, error: 'Claude failed: exit 127' })
    await expect(translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'ai-unavailable',
      detail: 'Claude failed: exit 127'
    })
  })

  it('treats empty model output as unavailable instead of an empty translation', async () => {
    runLocalPlanMock.mockResolvedValue({ success: true, rawOutput: '  \n ' })
    await expect(
      translateTextWithAi({ text: 'hi', preference: 'auto' }, deps)
    ).resolves.toMatchObject({ ok: false, kind: 'ai-unavailable' })
  })

  it('rejects blank and oversized input before spawning anything', async () => {
    await expect(translateTextWithAi({ text: '  ', preference: 'auto' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'invalid-input'
    })
    await expect(
      translateTextWithAi({ text: 'a'.repeat(5001), preference: 'auto' }, deps)
    ).resolves.toEqual({ ok: false, kind: 'too-long' })
    expect(runLocalPlanMock).not.toHaveBeenCalled()
  })
})

describe('cancelAiTranslation', () => {
  it('cancels the lane keyed by the same cwd the request used', () => {
    cancelAiTranslation({ cwd: '/home/tester' })
    expect(cancelLocalMock).toHaveBeenCalledWith('/home/tester')
  })
})
