import { DEFAULT_ORCA_DIR_NAME, sanitizeHomeOrcaDirName } from './orca-dir-names'

// Why re-exported: bootstrap and test-setup callers need the default alongside the
// initializer, and importing two modules for one concept invites them to drift.
export { DEFAULT_ORCA_DIR_NAME } from './orca-dir-names'

/** Why restart-scoped: swapping this mid-run would leave open credential handles and
 *  on-disk references pointing at two locations at once. */
let snapshot: string | null = null

export function initializeOrcaHomeDirName(raw: unknown): string {
  snapshot = sanitizeHomeOrcaDirName(raw) ?? DEFAULT_ORCA_DIR_NAME
  return snapshot
}

/** For hosts that boot before any settings store exists (`orcad`, `relay`). */
export function initializeOrcaHomeDirNameFromEnvironment(
  env: Record<string, string | undefined>
): string {
  return initializeOrcaHomeDirName(env.ORCA_HOME_DIR_NAME)
}

/** Why throw: a wrong home path silently writes credentials to the wrong place. */
export function getOrcaHomeDirName(): string {
  if (snapshot === null) {
    throw new Error('orca_home_dir_name_not_initialized')
  }
  return snapshot
}
