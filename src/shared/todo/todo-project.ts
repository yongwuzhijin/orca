export type TodoProject = {
  id: string
  name: string
  identifierPrefix: string
  nextSequence: number
  defaultWorkingDir: string | null
  createdAt: string
  updatedAt: string
}

export type CreateTodoProjectInput = {
  name: string
  identifierPrefix: string
}

export type RenameTodoProjectInput = {
  id: string
  name: string
}

export type UpdateTodoProjectInput = {
  id: string
  defaultWorkingDir?: string | null
}
