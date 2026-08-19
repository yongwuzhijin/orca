import { homedir } from 'node:os'
import { planCommitMessageGeneration } from '../../shared/commit-message-plan'
import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  TRANSLATION_INPUT_MAX_LENGTH,
  type TranslationRequest,
  type TranslationResponse
} from '../../shared/text-translation-types'
import { buildTranslationPrompt } from '../../shared/translation-prompt'
import { normalizeTranslationQuery } from '../../shared/translation-query-normalization'
import {
  resolveTranslationSourceLanguage,
  resolveTranslationTargetLanguage
} from '../../shared/translation-target-language'
import {
  cancelGenerateTranslationLocal,
  commandBackslashMode,
  resolveTextGenerationParams,
  runLocalPlanForAgent,
  type LocalGenerationTarget
} from '../text-generation/commit-message-text-generation'

export type AiTranslationDeps = {
  getSettings: () => GlobalSettings
  /** Overridable for tests; production always runs in the user's home. */
  cwd?: string
}

/**
 * The status bar is global, so there is no repo or execution host in scope: the
 * plan runs locally in the user's home directory. Agent and model come from the
 * already-configured `commitMessage` operation, but its `commandInputTemplate`
 * and `customPrompt` are deliberately ignored — both are commit-message-shaped
 * and would corrupt a translation prompt.
 */
export async function translateTextWithAi(
  request: TranslationRequest,
  deps: AiTranslationDeps
): Promise<TranslationResponse> {
  const trimmed = request.text.trim()
  if (trimmed === '') {
    return { ok: false, kind: 'invalid-input' }
  }
  if (trimmed.length > TRANSLATION_INPUT_MAX_LENGTH) {
    return { ok: false, kind: 'too-long' }
  }
  const text = normalizeTranslationQuery(trimmed)
  const target = resolveTranslationTargetLanguage(text, request.preference)

  const resolved = resolveTextGenerationParams(deps.getSettings(), 'local', 'commitMessage', null)
  if (!resolved.ok) {
    return { ok: false, kind: 'ai-unavailable', detail: resolved.error }
  }
  const generationTarget: LocalGenerationTarget = { kind: 'local', cwd: deps.cwd ?? homedir() }
  const planned = planCommitMessageGeneration(
    { ...resolved.params, backslash: commandBackslashMode(generationTarget) },
    buildTranslationPrompt(text, target)
  )
  if (!planned.ok) {
    return { ok: false, kind: 'ai-unavailable', detail: planned.error }
  }

  const result = await runLocalPlanForAgent(
    resolved.params.agentId,
    planned.plan,
    generationTarget,
    'translation',
    'translation'
  )
  if (!result.success) {
    return { ok: false, kind: 'ai-unavailable', detail: result.error }
  }
  const translatedText = result.rawOutput.trim()
  if (translatedText === '') {
    return { ok: false, kind: 'ai-unavailable', detail: `${planned.plan.label} returned nothing.` }
  }
  return {
    ok: true,
    translatedText,
    targetLanguage: target,
    // The agent does not report detection, so name the pair we asked it to use.
    detectedSourceLanguage: resolveTranslationSourceLanguage(target),
    providerId: 'ai',
    dictionaryEntries: [],
    queriedText: text,
    agentLabel: result.agentLabel ?? planned.plan.label
  }
}

export function cancelAiTranslation(deps: Pick<AiTranslationDeps, 'cwd'> = {}): void {
  cancelGenerateTranslationLocal(deps.cwd ?? homedir())
}
