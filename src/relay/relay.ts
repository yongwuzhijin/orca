#!/usr/bin/env node

// Orca Relay — remote-host daemon and reconnect bridge entry point.

// Orca Relay — lightweight daemon deployed to remote hosts over SCP and launched via an SSH exec channel.
// Communicates over stdin/stdout using the framed JSON-RPC protocol.
// On client disconnect it enters a grace period, keeping PTYs alive on a Unix domain socket; a later launch
// reconnects via `relay.js --connect`, bridging the new SSH channel's stdio to the existing relay's socket.

import { createServer, createConnection, type Socket, type Server } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  unlinkSync,
  existsSync,
  statSync,
  readFileSync,
  chmodSync,
  closeSync,
  openSync
} from 'node:fs'
import {
  RELAY_SENTINEL,
  FrameDecoder,
  MessageType,
  encodeJsonRpcFrame,
  parseJsonRpcMessage,
  type DecodedFrame,
  type JsonRpcResponse
} from './protocol'
import { initializeOrcaHomeDirNameFromEnvironment } from '../shared/orca-home-dir-name'
import { readLaunchVersion, runConnectHandshake, setupDaemonHandshake } from './relay-handshake'
import { RelayDispatcher } from './dispatcher'
import { RelayContext, expandTilde } from './context'
import { PtyHandler } from './pty-handler'
import { FsHandler } from './fs-handler'
import { installRelayLogRotation } from './rotating-log-writer'
import { GitHandler } from './git-handler'
import { PreflightHandler } from './preflight-handler'
import { ExternalAutomationsHandler } from './external-automations-handler'
import { PortScanHandler } from './port-scan-handler'
import { AgentExecHandler } from './agent-exec-handler'
import { WorkspaceSessionHandler } from './workspace-session-handler'
import { AiVaultHandler } from './ai-vault-handler'
import { createRelayAiVaultService } from './ai-vault-service-factory'
import { getRemoteHostPlatform } from '../main/ssh/ssh-remote-platform'
import { parseUnameToRelayPlatform } from '../main/ssh/relay-protocol'
import { RelayAgentHookServer } from './agent-hook-server'
import { endpointDirForRelaySocket } from './agent-hook-endpoint-coordinates'
import { PluginOverlayManager } from './plugin-overlay'
import {
  AGENT_HOOK_INSTALL_PLUGINS_METHOD,
  AGENT_HOOK_REQUEST_REPLAY_METHOD
} from '../shared/agent-hook-relay'
import { publishAgentHookEnvelope } from './agent-hook-envelope-publication'
import {
  DEFAULT_SSH_RELAY_GRACE_PERIOD_SECONDS,
  SSH_RELAY_CONFIGURE_GRACE_TIME_METHOD
} from '../shared/ssh-types'
import { assertPluginSourceUnderByteCap } from './plugin-source-limit'
import { resolveOpenCodeSourceConfigDir, resolvePiSourceAgentDir } from './plugin-overlay-env'
import {
  detectExplicitPiAgentKindFromCommand,
  isPiCompatibleAgentType
} from '../shared/pi-agent-kind'
import { resolveSetupAgentSequenceLaunchCommand } from '../shared/setup-agent-sequencing'
import { pickRemoteCliEnv } from './remote-cli-env'
import {
  applyRelayGraceTimeConfiguration,
  decideRelayGrace,
  type RelayGraceBranch
} from './relay-grace-branch'
import { relayLogLine } from './relay-diagnostic-log'

async function main(): Promise<void> {
  // Why env, not settings: relay runs as its own process on the remote host and has no
  // settings store. The local side does not yet propagate this — see the plan's deviations.
  initializeOrcaHomeDirNameFromEnvironment(process.env)
  const {
    graceTimeMs,
    connectMode,
    detached,
    cliMode,
    sockPath,
    endpointDir,
    logFile,
    credentialFile
  } = parseArgs(process.argv)
  const endpointCredential = readEndpointCredential(credentialFile)

  if (connectMode) {
    runConnectMode(sockPath, endpointCredential)
    return
  }
  if (options.cliMode) {
    const marker = process.argv.indexOf('--orca-cli')
    await runRelayOrcaCliChannel(
      options.sockPath,
      marker === -1 ? [] : process.argv.slice(marker + 1),
      endpointCredential
    )
    return
  }
  await runRelayDaemon(options, endpointCredential)
}

void main().catch((error) => {
  relayLogLine(
    `[relay] Fatal startup error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  )
  process.exit(1)
})
