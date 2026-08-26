import { homedir } from 'node:os'
import { join } from 'node:path'
import { getOrcaHomeDirName } from '../shared/orca-home-dir-name'

/** Orca's home-level state directory, named by the bootstrap snapshot. */
export function orcaHomeDir(home: string = homedir()): string {
  return join(home, getOrcaHomeDirName())
}

export function orcaHomeDirPath(...segments: string[]): string {
  return join(orcaHomeDir(), ...segments)
}
