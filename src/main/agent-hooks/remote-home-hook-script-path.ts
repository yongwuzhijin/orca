import { posix as pathPosix } from 'node:path'
import { getOrcaHomeDirName } from '../../shared/orca-home-dir-name'

/** Remote managed hook script path. Posix always — remote hook hosts run sh/Git Bash. */
export function remoteHomeAgentHookScriptPath(remoteHome: string, scriptFileName: string): string {
  // Why the `|| '/'`: a home of `/` strips to empty, which would yield a relative path.
  const home = remoteHome.replace(/\/+$/, '') || '/'
  return pathPosix.join(home, getOrcaHomeDirName(), 'agent-hooks', scriptFileName)
}
