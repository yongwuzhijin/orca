import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import { resolveLockedTodoActiveProjectId } from '../../../../shared/todo/todo-default-project'
import type {
  TodoProject,
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  UpdateTodoProjectInput
} from '../../../../shared/todo/todo-project'
import type {
  TodoItem,
  CreateTodoItemInput,
  UpdateTodoItemPatch
} from '../../../../shared/todo/todo-item'
import type {
  TodoTemplate,
  CreateTodoTemplateInput,
  UpdateTodoTemplateInput
} from '../../../../shared/todo/todo-template'
import type { TodoStatus } from '../../../../shared/todo/todo-status'

export type TodosSlice = {
  todoProjects: TodoProject[]
  todoActiveProjectId: string | null
  todoItems: TodoItem[]
  todoTemplates: TodoTemplate[]
  todoLoaded: boolean
  todoDetailItemId: string | null

  loadTodoProjects: () => Promise<void>
  setActiveTodoProject: (projectId: string) => Promise<void>
  createTodoProject: (input: CreateTodoProjectInput) => Promise<TodoProject>
  renameTodoProject: (input: RenameTodoProjectInput) => Promise<void>
  deleteTodoProject: (id: string) => Promise<void>
  updateTodoProject: (input: UpdateTodoProjectInput) => Promise<void>
  openTodoDetail: (id: string) => void
  closeTodoDetail: () => void

  loadTodoItems: (projectId: string) => Promise<void>
  createTodoItem: (input: CreateTodoItemInput) => Promise<TodoItem>
  updateTodoItem: (id: string, patch: UpdateTodoItemPatch) => Promise<TodoItem>
  moveTodoItem: (id: string, status: TodoStatus, orderKey: string) => Promise<TodoItem>
  deleteTodoItem: (id: string) => Promise<void>

  loadTodoTemplates: () => Promise<void>
  createTodoTemplate: (input: CreateTodoTemplateInput) => Promise<TodoTemplate>
  updateTodoTemplate: (input: UpdateTodoTemplateInput) => Promise<TodoTemplate>
  deleteTodoTemplate: (id: string) => Promise<void>
}

export const createTodosSlice: StateCreator<AppState, [], [], TodosSlice> = (set, get) => ({
  todoProjects: [],
  todoActiveProjectId: null,
  todoItems: [],
  todoTemplates: [],
  todoLoaded: false,
  todoDetailItemId: null,

  loadTodoProjects: async () => {
    const projects = await window.api.todos.projects.list()
    // Why: product locks Todos to the built-in default board; ignore legacy actives.
    set({
      todoProjects: projects,
      todoActiveProjectId: resolveLockedTodoActiveProjectId(),
      todoLoaded: true
    })
  },

  setActiveTodoProject: async (projectId) => {
    set({ todoActiveProjectId: projectId })
    await get().loadTodoItems(projectId)
  },

  createTodoProject: async (input) => {
    const created = await window.api.todos.projects.create(input)
    set((s) => ({
      todoProjects: [...s.todoProjects, created],
      // Adopt the new project as active when none was selected yet.
      todoActiveProjectId: s.todoActiveProjectId ?? created.id
    }))
    return created
  },

  renameTodoProject: async (input) => {
    const updated = await window.api.todos.projects.rename(input)
    set((s) => ({
      todoProjects: s.todoProjects.map((project) => (project.id === updated.id ? updated : project))
    }))
  },

  deleteTodoProject: async (id) => {
    await window.api.todos.projects.delete(id)
    const wasActive = get().todoActiveProjectId === id
    const remaining = get().todoProjects.filter((project) => project.id !== id)
    if (wasActive) {
      // Switch to the first remaining project (or clear) since the active one is gone.
      const nextActive = remaining[0]?.id ?? null
      set({ todoProjects: remaining, todoActiveProjectId: nextActive, todoItems: [] })
      if (nextActive) {
        await get().loadTodoItems(nextActive)
      }
      return
    }
    set({ todoProjects: remaining })
  },

  updateTodoProject: async (input) => {
    const updated = await window.api.todos.projects.update(input)
    set((s) => ({
      todoProjects: s.todoProjects.map((project) => (project.id === updated.id ? updated : project))
    }))
  },

  openTodoDetail: (id) => set({ todoDetailItemId: id }),
  closeTodoDetail: () => set({ todoDetailItemId: null }),

  loadTodoItems: async (projectId) => {
    const items = await window.api.todos.items.list(projectId)
    set({ todoItems: items })
  },

  createTodoItem: async (input) => {
    const created = await window.api.todos.items.create(input)
    if (created.projectId === get().todoActiveProjectId) {
      set((s) => ({ todoItems: [...s.todoItems, created] }))
    }
    return created
  },

  updateTodoItem: async (id, patch) => {
    const updated = await window.api.todos.items.update(id, patch)
    set((s) => ({
      todoItems: s.todoItems.map((item) => (item.id === updated.id ? updated : item))
    }))
    return updated
  },

  moveTodoItem: async (id, status, orderKey) => {
    const moved = await window.api.todos.items.move(id, status, orderKey)
    set((s) => ({
      todoItems: s.todoItems.map((item) => (item.id === moved.id ? moved : item))
    }))
    return moved
  },

  deleteTodoItem: async (id) => {
    await window.api.todos.items.delete(id)
    set((s) => ({ todoItems: s.todoItems.filter((item) => item.id !== id) }))
  },

  loadTodoTemplates: async () => {
    const templates = await window.api.todos.templates.list()
    set({ todoTemplates: templates })
  },

  createTodoTemplate: async (input) => {
    const created = await window.api.todos.templates.create(input)
    set((s) => ({ todoTemplates: [...s.todoTemplates, created] }))
    return created
  },

  updateTodoTemplate: async (input) => {
    const updated = await window.api.todos.templates.update(input)
    set((s) => ({
      todoTemplates: s.todoTemplates.map((template) =>
        template.id === updated.id ? updated : template
      )
    }))
    return updated
  },

  deleteTodoTemplate: async (id) => {
    await window.api.todos.templates.delete(id)
    set((s) => ({ todoTemplates: s.todoTemplates.filter((template) => template.id !== id) }))
  }
})
