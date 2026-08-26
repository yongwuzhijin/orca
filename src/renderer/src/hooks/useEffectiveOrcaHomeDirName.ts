import React from 'react'
import { DEFAULT_ORCA_DIR_NAME } from '../../../shared/orca-dir-names'

// Why a one-shot fetch: this is the running process's boot-time value, so it cannot change
// while the window is open. Rendering the pending setting instead would point users at a
// path this process is not reading.
let cached: Promise<string> | null = null

export function useEffectiveOrcaHomeDirName(): string {
  const [name, setName] = React.useState(DEFAULT_ORCA_DIR_NAME)
  React.useEffect(() => {
    // Why optional chaining: this is a leaf label in panes that render before the bridge is
    // wired, and an unreachable identity probe must degrade to the default, never throw.
    cached ??= Promise.resolve(window.api?.app?.getIdentity())
      .then((identity) => identity?.orcaHomeDirName || DEFAULT_ORCA_DIR_NAME)
      .catch(() => DEFAULT_ORCA_DIR_NAME)
    let cancelled = false
    void cached.then((value) => {
      if (!cancelled) {
        setName(value)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return name
}
