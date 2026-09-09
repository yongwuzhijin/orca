import { randomUUID } from 'node:crypto'
import type Database from '../sqlite/sync-database'
import type {
  CreateTodoClarificationTemplateInput,
  TodoClarificationTemplate,
  UpdateTodoClarificationTemplateInput
} from '../../shared/todo/todo-clarification-template'
import { rowToTemplate, type TodoTemplateRow } from './todo-row-mapping'

function nowIso(): string {
  return new Date().toISOString()
}

function requireClarificationTemplate(
  db: Database.Database,
  id: string
): TodoClarificationTemplate {
  const row = db.prepare('SELECT * FROM todo_clarification_templates WHERE id = ?').get(id) as
    | TodoTemplateRow
    | undefined
  if (!row) {
    throw new Error(`TodoRepository: clarification template not found: ${id}`)
  }
  return rowToTemplate(row)
}

export function listTodoClarificationTemplates(db: Database.Database): TodoClarificationTemplate[] {
  const rows = db
    .prepare('SELECT * FROM todo_clarification_templates ORDER BY created_at ASC')
    .all() as TodoTemplateRow[]
  return rows.map(rowToTemplate)
}

export function createTodoClarificationTemplate(
  db: Database.Database,
  input: CreateTodoClarificationTemplateInput
): TodoClarificationTemplate {
  const timestamp = nowIso()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO todo_clarification_templates (id, name, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, input.name, input.body, timestamp, timestamp)
  return requireClarificationTemplate(db, id)
}

export function updateTodoClarificationTemplate(
  db: Database.Database,
  input: UpdateTodoClarificationTemplateInput
): TodoClarificationTemplate {
  const current = requireClarificationTemplate(db, input.id)
  const name = input.name ?? current.name
  const body = input.body ?? current.body
  db.prepare(
    'UPDATE todo_clarification_templates SET name = ?, body = ?, updated_at = ? WHERE id = ?'
  ).run(name, body, nowIso(), input.id)
  return requireClarificationTemplate(db, input.id)
}

export function deleteTodoClarificationTemplate(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM todo_clarification_templates WHERE id = ?').run(id)
}
