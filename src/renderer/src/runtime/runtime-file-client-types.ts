import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { OrcaDirNameSettingsSlice } from '../../../shared/orca-dir-names'

export type RuntimeFileSettingsSlice = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> &
  OrcaDirNameSettingsSlice

export type RuntimeReadableFileContent = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

export type RuntimeFileReadArgs = {
  settings: RuntimeFileSettingsSlice | null | undefined
  filePath: string
  relativePath?: string
  worktreeId?: string
  connectionId?: string
  expectedExternalSshTargetId?: string
  includeLocalLogMetadata?: boolean
}

export type RuntimeFileOperationArgs = {
  settings: RuntimeFileSettingsSlice | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string | null | undefined
  connectionId?: string
  expectedExecutionHostId?: 'local' | `ssh:${string}`
  expectedSshTargetId?: string
  expectedSshConnectionGeneration?: number
  expectedExternalSshTargetId?: string
}

export type RuntimeFileDownloadResult =
  | { canceled: true }
  | { canceled: false; destinationPath: string }
