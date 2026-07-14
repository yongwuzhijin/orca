import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import {
  DEFAULT_TODO_PROJECT_ID,
  DEFAULT_TODO_PROJECT_NAME,
  DEFAULT_TODO_PROJECT_PREFIX
} from '../../shared/todo/todo-default-project'
import type {
  CreateTodoProjectInput,
  RenameTodoProjectInput,
  TodoProject,
  UpdateTodoProjectInput
} from '../../shared/todo/todo-project'
import { rowToProject, type TodoProjectRow } from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

function requireProject(db: Database.Database, id: string): TodoProject {
  const row = db.prepare('SELECT * FROM todo_projects WHERE id = ?').get(id) as
    | TodoProjectRow
    | undefined
  if (!row) {
    throw new Error(`TodoRepository: project not found: ${id}`)
  }
  return rowToProject(row)
}

export function ensureDefaultTodoProject(db: Database.Database): TodoProject {
  const existing = db
    .prepare('SELECT * FROM todo_projects WHERE id = ?')
    .get(DEFAULT_TODO_PROJECT_ID) as TodoProjectRow | undefined
  if (existing) {
    return rowToProject(existing)
  }
  const timestamp = nowIso()
  db.prepare(
    `INSERT INTO todo_projects (id, name, identifier_prefix, next_sequence, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(
    DEFAULT_TODO_PROJECT_ID,
    DEFAULT_TODO_PROJECT_NAME,
    DEFAULT_TODO_PROJECT_PREFIX,
    timestamp,
    timestamp
  )
  return requireProject(db, DEFAULT_TODO_PROJECT_ID)
}

export function listTodoProjects(db: Database.Database): TodoProject[] {
  // Why: product locks the Todo UI to one built-in board; ensure on every list
  // so empty DBs and post-delete default rows always come back.
  ensureDefaultTodoProject(db)
  const rows = db
    .prepare('SELECT * FROM todo_projects ORDER BY created_at ASC')
    .all() as TodoProjectRow[]
  return rows.map(rowToProject)
}

export function createTodoProject(
  db: Database.Database,
  input: CreateTodoProjectInput
): TodoProject {
  const timestamp = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO todo_projects (id, name, identifier_prefix, next_sequence, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)`
  ).run(id, input.name, input.identifierPrefix, timestamp, timestamp)
  return requireProject(db, id)
}

export function renameTodoProject(
  db: Database.Database,
  input: RenameTodoProjectInput
): TodoProject {
  db.prepare('UPDATE todo_projects SET name = ?, updated_at = ? WHERE id = ?').run(
    input.name,
    nowIso(),
    input.id
  )
  return requireProject(db, input.id)
}

export function updateTodoProject(
  db: Database.Database,
  input: UpdateTodoProjectInput
): TodoProject {
  if (input.defaultWorkingDir !== undefined) {
    db.prepare('UPDATE todo_projects SET default_working_dir = ?, updated_at = ? WHERE id = ?').run(
      input.defaultWorkingDir,
      nowIso(),
      input.id
    )
  }
  return requireProject(db, input.id)
}

export function deleteTodoProject(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM todo_projects WHERE id = ?').run(id)
}
