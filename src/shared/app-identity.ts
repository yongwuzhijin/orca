export type AppIdentity = {
  name: string
  isDev: boolean
  devLabel: string | null
  devBranch: string | null
  devWorktreeName: string | null
  devRepoRoot: string | null
  dockBadgeLabel: string | null
  /** The home Orca directory name this process actually booted with. */
  orcaHomeDirName: string
}
