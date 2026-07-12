import { ipcMain } from 'electron'
import type { TodoRepository } from '../todos/todo-repository'
import type { CreateTodoItemInput, UpdateTodoItemPatch } from '../../shared/todo/todo-item'
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput
} from '../../shared/todo/todo-project'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type {
  CreateTodoTemplateInput,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'

export function registerTodoHandlers(repo: TodoRepository): void {
  // Projects
  ipcMain.handle('todos:projects:list', () => repo.listProjects())
  ipcMain.handle('todos:projects:create', (_event, input: CreateTodoProjectInput) =>
    repo.createProject(input)
  )
  ipcMain.handle('todos:projects:rename', (_event, input: RenameTodoProjectInput) =>
    repo.renameProject(input)
  )
  ipcMain.handle('todos:projects:update', (_event, input: UpdateTodoProjectInput) =>
    repo.updateProject(input)
  )
  ipcMain.handle('todos:projects:delete', (_event, id: string) => repo.deleteProject(id))

  // Items
  ipcMain.handle('todos:items:list', (_event, projectId: string) => repo.listItems(projectId))
  ipcMain.handle('todos:items:get', (_event, id: string) => repo.getItem(id))
  ipcMain.handle('todos:items:create', (_event, input: CreateTodoItemInput) =>
    repo.createItem(input)
  )
  ipcMain.handle('todos:items:update', (_event, args: { id: string; patch: UpdateTodoItemPatch }) =>
    repo.updateItem(args.id, args.patch)
  )
  ipcMain.handle('todos:items:delete', (_event, id: string) => repo.deleteItem(id))
  ipcMain.handle(
    'todos:items:move',
    (_event, args: { id: string; status: TodoStatus; orderKey: string }) =>
      repo.moveItem(args.id, args.status, args.orderKey)
  )

  // Templates
  ipcMain.handle('todos:templates:list', () => repo.listTemplates())
  ipcMain.handle('todos:templates:create', (_event, input: CreateTodoTemplateInput) =>
    repo.createTemplate(input)
  )
  ipcMain.handle('todos:templates:update', (_event, input: UpdateTodoTemplateInput) =>
    repo.updateTemplate(input)
  )
  ipcMain.handle('todos:templates:delete', (_event, id: string) => repo.deleteTemplate(id))
}
