import { ipcMain } from 'electron'
import type { TodoDashboardRange } from '../../shared/todo/todo-dashboard'
import {
  createTodoDashboardService,
  type TodoDashboardServiceDeps
} from '../todos/todo-dashboard-service'

export function registerTodoDashboardHandlers(deps: TodoDashboardServiceDeps): void {
  const service = createTodoDashboardService(deps)
  ipcMain.handle(
    'todos:dashboard.getMetrics',
    (_event, args: { projectId: string; range: TodoDashboardRange }) => service.getMetrics(args)
  )
}
