import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { ensureAgentStartupInTerminal } from '@/lib/new-workspace'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { resolveWorktreeIdByPath } from '../../../../../shared/todo/resolve-worktree-id-by-path'
import type { TuiAgent } from '../../../../../shared/tui-agent'
import { isTuiAgent } from '../../../../../shared/tui-agent-config'
import { tuiAgentToAgentKind } from '@/lib/telemetry'

function buildWorktreePathMap(
  worktreesByRepo: Record<string, { id: string; path: string }[]>
): Map<string, { worktreeId: string; path: string }[]> {
  const map = new Map<string, { worktreeId: string; path: string }[]>()
  for (const [repoId, worktrees] of Object.entries(worktreesByRepo)) {
    map.set(
      repoId,
      worktrees.map((worktree) => ({ worktreeId: worktree.id, path: worktree.path }))
    )
  }
  return map
}

export async function startTodoViaTerminal(args: {
  agent: TuiAgent
  prompt: string
  worktreeId?: string
  cwd?: string
}): Promise<boolean> {
  const state = useAppStore.getState()
  const worktreeId =
    args.worktreeId ??
    (args.cwd
      ? resolveWorktreeIdByPath(args.cwd, buildWorktreePathMap(state.worktreesByRepo))
      : null)
  if (!worktreeId) {
    toast.error(
      translate(
        'auto.components.todo.detail.todoTerminalTaskStart.noWorkspace',
        'No workspace found for this path. Create or open a workspace first.'
      )
    )
    return false
  }

  const settings = state.settings
  const startupPlan = buildAgentStartupPlan({
    agent: args.agent,
    prompt: args.prompt,
    cmdOverrides: settings?.agentCmdOverrides ?? {},
    platform: navigator.userAgent.includes('Win') ? 'win32' : process.platform,
    agentArgs: settings?.agentDefaultArgs?.[args.agent] ?? null,
    agentEnv: settings?.agentDefaultEnv?.[args.agent] ?? null
  })
  if (!startupPlan) {
    toast.error(
      translate(
        'auto.components.todo.detail.todoTerminalTaskStart.startupFailed',
        'Could not build an agent launch plan for this agent.'
      )
    )
    return false
  }

  const launchDraftPrompt = startupPlan.draftPrompt ?? args.prompt.trim()
  const activation = activateAndRevealWorktree(worktreeId, {
    sidebarRevealBehavior: 'auto',
    startup: {
      command: startupPlan.launchCommand,
      ...(startupPlan.env ? { env: startupPlan.env } : {}),
      launchConfig: startupPlan.launchConfig,
      ...(startupPlan.launchToken ? { launchToken: startupPlan.launchToken } : {}),
      launchAgent: args.agent,
      ...(startupPlan.draftPrompt ? { draftPrompt: startupPlan.draftPrompt } : {}),
      ...(launchDraftPrompt ? { launchDraftText: launchDraftPrompt } : {}),
      ...(startupPlan.startupCommandDelivery
        ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
        : {}),
      telemetry: {
        agent_kind: tuiAgentToAgentKind(args.agent),
        launch_source: 'sidebar',
        request_kind: 'new' as const
      }
    }
  })

  if (startupPlan.followupPrompt || startupPlan.draftPrompt) {
    void ensureAgentStartupInTerminal({
      worktreeId,
      primaryTabId: activation === false ? null : activation.primaryTabId,
      startup: startupPlan
    })
  }

  return activation !== false
}

export function parseTodoTerminalAgent(value: string | null | undefined): TuiAgent | null {
  return value && isTuiAgent(value) ? value : null
}
