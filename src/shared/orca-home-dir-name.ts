import { DEFAULT_ORCA_DIR_NAME, sanitizeHomeOrcaDirName } from './orca-dir-names'

// Why re-exported: bootstrap and test-setup callers need the default alongside the
// initializer, and importing two modules for one concept invites them to drift.
export { DEFAULT_ORCA_DIR_NAME } from './orca-dir-names'

/**
 * Why restart-scoped: swapping this mid-run would leave open credential handles and
 * on-disk references pointing at two locations at once.
 *
 * Why a global symbol and not a module-level `let` (same reasoning as
 * `secret-store.ts`): `vi.resetModules()` gives the re-imported graph a fresh copy of
 * this module, so a name seeded before the reset would read back as uninitialized and
 * `getOrcaHomeDirName()` throws on that. Anchoring to the realm keeps one snapshot per
 * process however often the module registry is rebuilt.
 */
const SLOT = Symbol.for('orca.host.homeDirName')

type Slot = { [SLOT]?: string | null }

function slot(): Slot {
  return globalThis as unknown as Slot
}

export function initializeOrcaHomeDirName(raw: unknown): string {
  const name = sanitizeHomeOrcaDirName(raw) ?? DEFAULT_ORCA_DIR_NAME
  slot()[SLOT] = name
  return name
}

/** Test-only: restores the pre-bootstrap state the throwing getter guards. */
export function clearOrcaHomeDirNameForTests(): void {
  delete slot()[SLOT]
}

/** For hosts that boot before any settings store exists (`orcad`, `relay`). */
export function initializeOrcaHomeDirNameFromEnvironment(
  env: Record<string, string | undefined>
): string {
  return initializeOrcaHomeDirName(env.ORCA_HOME_DIR_NAME)
}

/** Why throw: a wrong home path silently writes credentials to the wrong place. */
export function getOrcaHomeDirName(): string {
  const snapshot = slot()[SLOT]
  if (snapshot === null || snapshot === undefined) {
    throw new Error('orca_home_dir_name_not_initialized')
  }
  return snapshot
}
