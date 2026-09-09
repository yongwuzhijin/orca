import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type {
  CreateTodoTemplateInput,
  TodoTemplate,
  UpdateTodoTemplateInput
} from '../../shared/todo/todo-template'
import { rowToTemplate, type TodoTemplateRow } from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

function requireTemplate(db: Database.Database, id: string): TodoTemplate {
  const row = db.prepare('SELECT * FROM todo_templates WHERE id = ?').get(id) as
    | TodoTemplateRow
    | undefined
  if (!row) {
    throw new Error(`TodoRepository: template not found: ${id}`)
  }
  return rowToTemplate(row)
}

export function listTodoTemplates(db: Database.Database): TodoTemplate[] {
  const rows = db
    .prepare('SELECT * FROM todo_templates ORDER BY created_at ASC')
    .all() as TodoTemplateRow[]
  return rows.map(rowToTemplate)
}

export function createTodoTemplate(
  db: Database.Database,
  input: CreateTodoTemplateInput
): TodoTemplate {
  const timestamp = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO todo_templates (id, name, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.name, input.body, timestamp, timestamp)
  return requireTemplate(db, id)
}

export function updateTodoTemplate(
  db: Database.Database,
  input: UpdateTodoTemplateInput
): TodoTemplate {
  const current = requireTemplate(db, input.id)
  const name = input.name ?? current.name
  const body = input.body ?? current.body
  db.prepare('UPDATE todo_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?').run(
    name,
    body,
    nowIso(),
    input.id
  )
  return requireTemplate(db, input.id)
}

export function deleteTodoTemplate(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM todo_templates WHERE id = ?').run(id)
}
