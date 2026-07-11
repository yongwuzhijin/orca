export type TodoTemplate = {
  id: string
  name: string
  body: string
  createdAt: string
  updatedAt: string
}

export type CreateTodoTemplateInput = {
  name: string
  body: string
}

export type UpdateTodoTemplateInput = {
  id: string
  name?: string
  body?: string
}
