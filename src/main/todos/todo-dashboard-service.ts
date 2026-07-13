import type { TodoItem } from '../../shared/todo/todo-item'
import type { AcpSessionRecord } from '../../shared/acp/acp-session'
import type {
  TodoDashboardMetrics,
  TodoDashboardRange,
  TokenCostPerTask
} from '../../shared/todo/todo-dashboard'
import { computeTodoDashboardMetrics } from './todo-dashboard-metrics'

export type TodoDashboardServiceDeps = {
  listItems: (projectId: string) => TodoItem[]
  getSessions: (taskId: string) => AcpSessionRecord[]
  resolveWorktreeId: (cwd: string | null) => string | null
  resolveTokenCost: (input: {
    item: TodoItem
    session: AcpSessionRecord | null
    worktreeId: string | null
  }) => Promise<TokenCostPerTask>
  now: () => number
}

export function createTodoDashboardService(deps: TodoDashboardServiceDeps) {
  return {
    async getMetrics(args: {
      projectId: string
      range: TodoDashboardRange
    }): Promise<TodoDashboardMetrics> {
      const doneItems = deps.listItems(args.projectId).filter((item) => item.status === 'done')
      const tokenByTaskId = new Map<string, TokenCostPerTask>()
      for (const item of doneItems) {
        const session = deps.getSessions(item.id)[0] ?? null
        const worktreeId = deps.resolveWorktreeId(session?.cwd ?? null)
        const cost = await deps.resolveTokenCost({ item, session, worktreeId })
        tokenByTaskId.set(item.id, cost)
      }
      const metrics = computeTodoDashboardMetrics({
        doneItems,
        tokenByTaskId,
        range: args.range,
        now: deps.now()
      })
      return { ...metrics, projectId: args.projectId }
    }
  }
}
