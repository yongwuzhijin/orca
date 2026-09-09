import { ipcRenderer } from 'electron'
import type {
  TodoProject,
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput
} from '../../shared/todo/todo-project'
import type {
  TodoItem,
  CreateTodoItemInput,
  UpdateTodoItemPatch
} from '../../shared/todo/todo-item'
import type {
  TodoTemplate,
  CreateTodoTemplateInput,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import type {
  TodoClarificationTemplate,
  CreateTodoClarificationTemplateInput,
  UpdateTodoClarificationTemplateInput,
  ClarificationState
} from '../../shared/todo/todo-clarification-template'
import type { ParsedClarificationState } from '../../shared/todo/clarification-state'
import type { TodoStatus } from '../../shared/todo/todo-status'
import type { MergeOutcome, MergePlan } from '../../shared/todo/todo-merge'
import type { TodoDashboardMetrics, TodoDashboardRange } from '../../shared/todo/todo-dashboard'
import type { WorkspacePort } from '../../shared/workspace-ports'

export type TodosApi = {
  projects: {
    list: () => Promise<TodoProject[]>
    create: (input: CreateTodoProjectInput) => Promise<TodoProject>
    rename: (input: RenameTodoProjectInput) => Promise<TodoProject>
    update: (input: UpdateTodoProjectInput) => Promise<TodoProject>
    delete: (id: string) => Promise<void>
  }
  items: {
    list: (projectId: string) => Promise<TodoItem[]>
    get: (id: string) => Promise<TodoItem | null>
    create: (input: CreateTodoItemInput) => Promise<TodoItem>
    update: (id: string, patch: UpdateTodoItemPatch) => Promise<TodoItem>
    delete: (id: string) => Promise<void>
    move: (id: string, status: TodoStatus, orderKey: string) => Promise<TodoItem>
  }
  templates: {
    list: () => Promise<TodoTemplate[]>
    create: (input: CreateTodoTemplateInput) => Promise<TodoTemplate>
    update: (input: UpdateTodoTemplateInput) => Promise<TodoTemplate>
    delete: (id: string) => Promise<void>
  }
  clarificationTemplates: {
    list: () => Promise<TodoClarificationTemplate[]>
    create: (input: CreateTodoClarificationTemplateInput) => Promise<TodoClarificationTemplate>
    update: (input: UpdateTodoClarificationTemplateInput) => Promise<TodoClarificationTemplate>
    delete: (id: string) => Promise<void>
  }
  requirement: {
    initWorktree: (args: {
      worktreePath: string
      todoId: string
      title: string
      prdLink?: string | null
    }) => Promise<void>
    readClarification: (args: { worktreePath: string }) => Promise<ParsedClarificationState>
    writeClarification: (args: { worktreePath: string; state: ClarificationState }) => Promise<void>
  }
  review: {
    scanPorts: (input: { taskId: string }) => Promise<WorkspacePort[]>
  }
  merge: {
    preview: (input: { taskId: string }) => Promise<MergePlan>
    execute: (input: { taskId: string }) => Promise<MergeOutcome>
  }
  dashboard: {
    getMetrics: (args: {
      projectId: string
      range: TodoDashboardRange
    }) => Promise<TodoDashboardMetrics>
  }
}

export const todosApi = {
  projects: {
    list: (): Promise<TodoProject[]> => ipcRenderer.invoke('todos:projects:list'),
    create: (input: CreateTodoProjectInput): Promise<TodoProject> =>
      ipcRenderer.invoke('todos:projects:create', input),
    rename: (input: RenameTodoProjectInput): Promise<TodoProject> =>
      ipcRenderer.invoke('todos:projects:rename', input),
    update: (input: UpdateTodoProjectInput): Promise<TodoProject> =>
      ipcRenderer.invoke('todos:projects:update', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('todos:projects:delete', id)
  },
  items: {
    list: (projectId: string): Promise<TodoItem[]> =>
      ipcRenderer.invoke('todos:items:list', projectId),
    get: (id: string): Promise<TodoItem | null> => ipcRenderer.invoke('todos:items:get', id),
    create: (input: CreateTodoItemInput): Promise<TodoItem> =>
      ipcRenderer.invoke('todos:items:create', input),
    update: (id: string, patch: UpdateTodoItemPatch): Promise<TodoItem> =>
      ipcRenderer.invoke('todos:items:update', { id, patch }),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('todos:items:delete', id),
    move: (id: string, status: TodoStatus, orderKey: string): Promise<TodoItem> =>
      ipcRenderer.invoke('todos:items:move', { id, status, orderKey })
  },
  templates: {
    list: (): Promise<TodoTemplate[]> => ipcRenderer.invoke('todos:templates:list'),
    create: (input: CreateTodoTemplateInput): Promise<TodoTemplate> =>
      ipcRenderer.invoke('todos:templates:create', input),
    update: (input: UpdateTodoTemplateInput): Promise<TodoTemplate> =>
      ipcRenderer.invoke('todos:templates:update', input),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('todos:templates:delete', id)
  },
  clarificationTemplates: {
    list: (): Promise<TodoClarificationTemplate[]> =>
      ipcRenderer.invoke('todos:clarification-templates:list'),
    create: (input: CreateTodoClarificationTemplateInput): Promise<TodoClarificationTemplate> =>
      ipcRenderer.invoke('todos:clarification-templates:create', input),
    update: (input: UpdateTodoClarificationTemplateInput): Promise<TodoClarificationTemplate> =>
      ipcRenderer.invoke('todos:clarification-templates:update', input),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('todos:clarification-templates:delete', id)
  },
  requirement: {
    initWorktree: (args: {
      worktreePath: string
      todoId: string
      title: string
      prdLink?: string | null
    }): Promise<void> => ipcRenderer.invoke('todos:requirement.initWorktree', args),
    readClarification: (args: { worktreePath: string }): Promise<ParsedClarificationState> =>
      ipcRenderer.invoke('todos:requirement.readClarification', args),
    writeClarification: (args: {
      worktreePath: string
      state: ClarificationState
    }): Promise<void> => ipcRenderer.invoke('todos:requirement.writeClarification', args)
  },
  review: {
    scanPorts: (input: { taskId: string }): Promise<WorkspacePort[]> =>
      ipcRenderer.invoke('todos:review.scanPorts', input)
  },
  merge: {
    preview: (input: { taskId: string }): Promise<MergePlan> =>
      ipcRenderer.invoke('todos:merge.preview', input),
    execute: (input: { taskId: string }): Promise<MergeOutcome> =>
      ipcRenderer.invoke('todos:merge.execute', input)
  },
  dashboard: {
    getMetrics: (args: {
      projectId: string
      range: TodoDashboardRange
    }): Promise<TodoDashboardMetrics> => ipcRenderer.invoke('todos:dashboard.getMetrics', args)
  }
} satisfies TodosApi
