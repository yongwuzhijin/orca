import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_TODO_PROJECT_ID,
  DEFAULT_TODO_PROJECT_NAME,
  DEFAULT_TODO_PROJECT_PREFIX
} from '../../shared/todo/todo-default-project'
import { TodoDatabase } from './todo-database'
import { TodoRepository } from './todo-repository'

describe('TodoRepository', () => {
  let db: TodoDatabase | undefined

  afterEach(() => {
    db?.close()
  })

  function createRepo(): TodoRepository {
    db = new TodoDatabase(':memory:')
    return new TodoRepository(db)
  }

  function makeProject(repo: TodoRepository, prefix = 'MT') {
    return repo.createProject({ name: 'My Tasks', identifierPrefix: prefix })
  }

  describe('projects', () => {
    it('createProject returns a project with generated id, nextSequence 1, timestamps', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      expect(project.id).toBeTruthy()
      expect(project.name).toBe('My Tasks')
      expect(project.identifierPrefix).toBe('MT')
      expect(project.nextSequence).toBe(1)
      expect(project.createdAt).toBeTruthy()
      expect(project.updatedAt).toBeTruthy()
    })

    it('listProjects returns created projects and ensures the default', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const list = repo.listProjects()
      expect(list.some((entry) => entry.id === project.id)).toBe(true)
      expect(list.some((entry) => entry.id === DEFAULT_TODO_PROJECT_ID)).toBe(true)
    })

    it('renameProject changes name and updatedAt', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const renamed = repo.renameProject({ id: project.id, name: 'Renamed' })
      expect(renamed.name).toBe('Renamed')
      expect(renamed.updatedAt >= project.updatedAt).toBe(true)
    })

    it('deleteProject removes a non-default project; list still ensures default', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      repo.deleteProject(project.id)
      const list = repo.listProjects()
      expect(list.some((entry) => entry.id === project.id)).toBe(false)
      expect(list.some((entry) => entry.id === DEFAULT_TODO_PROJECT_ID)).toBe(true)
    })

    it('createProject defaults defaultWorkingDir to null (P2b)', () => {
      const repo = createRepo()
      const p = repo.createProject({ name: 'P', identifierPrefix: 'P' })
      expect(p.defaultWorkingDir).toBeNull()
    })

    it('updateProject writes defaultWorkingDir (P2b)', () => {
      const repo = createRepo()
      const p = repo.createProject({ name: 'P', identifierPrefix: 'P' })
      const updated = repo.updateProject({ id: p.id, defaultWorkingDir: '/tmp/w' })
      expect(updated.defaultWorkingDir).toBe('/tmp/w')
    })

    it('ensureDefaultProject creates the default project when missing', () => {
      const repo = createRepo()
      const project = repo.ensureDefaultProject()
      expect(project).toEqual(
        expect.objectContaining({
          id: DEFAULT_TODO_PROJECT_ID,
          name: DEFAULT_TODO_PROJECT_NAME,
          identifierPrefix: DEFAULT_TODO_PROJECT_PREFIX,
          nextSequence: 1,
          defaultWorkingDir: null
        })
      )
    })

    it('ensureDefaultProject is idempotent and preserves defaultWorkingDir', () => {
      const repo = createRepo()
      repo.ensureDefaultProject()
      repo.updateProject({ id: DEFAULT_TODO_PROJECT_ID, defaultWorkingDir: '/work' })
      const again = repo.ensureDefaultProject()
      expect(again.defaultWorkingDir).toBe('/work')
      expect(repo.listProjects().filter((p) => p.id === DEFAULT_TODO_PROJECT_ID)).toHaveLength(1)
    })

    it('listProjects ensures the default project exists on an empty db', () => {
      const repo = createRepo()
      const list = repo.listProjects()
      expect(list.some((p) => p.id === DEFAULT_TODO_PROJECT_ID)).toBe(true)
    })
  })

  describe('items — identifier sequencing', () => {
    it('assigns MT-1 then MT-2 and bumps project nextSequence to 3', () => {
      const repo = createRepo()
      const project = makeProject(repo, 'MT')
      const first = repo.createItem({ projectId: project.id, title: 'A' })
      const second = repo.createItem({ projectId: project.id, title: 'B' })
      expect(first.identifier).toBe('MT-1')
      expect(second.identifier).toBe('MT-2')
      const refetched = repo.listProjects().find((p) => p.id === project.id)
      expect(refetched?.nextSequence).toBe(3)
    })
  })

  describe('items — labels JSON round-trip', () => {
    it('stores and returns labels array', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A', labels: ['a', 'b'] })
      const fetched = repo.getItem(item.id)
      expect(fetched?.labels).toEqual(['a', 'b'])
    })
  })

  describe('items — defaults', () => {
    it('applies defaults when only projectId+title given', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A' })
      expect(item.status).toBe('backlog')
      expect(item.priority).toBe('none')
      expect(item.description).toBe('')
      expect(item.labels).toEqual([])
      expect(item.scheduledDate).toBeNull()
      expect(item.estimate).toBeNull()
      expect(item.templateId).toBeNull()
      expect(item.startedAt).toBeNull()
      expect(item.completedAt).toBeNull()
      expect(item.orderKey).toBeTruthy()
    })
  })

  describe('items — status transitions', () => {
    it('sets completedAt on terminal and clears it when leaving terminal', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A' })
      const done = repo.updateItem(item.id, { status: 'done' })
      expect(done.completedAt).not.toBeNull()
      const reopened = repo.updateItem(item.id, { status: 'todo' })
      expect(reopened.completedAt).toBeNull()
    })

    it('sets startedAt on in_progress and keeps it after leaving in_progress', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A' })
      const started = repo.updateItem(item.id, { status: 'in_progress' })
      expect(started.startedAt).not.toBeNull()
      const later = repo.updateItem(item.id, { status: 'todo' })
      expect(later.startedAt).not.toBeNull()
    })
  })

  describe('items — listItems ordering', () => {
    it('returns items ordered by order_key ASC', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const a = repo.createItem({ projectId: project.id, title: 'A' })
      const b = repo.createItem({ projectId: project.id, title: 'B' })
      const c = repo.createItem({ projectId: project.id, title: 'C' })
      const items = repo.listItems(project.id)
      expect(items.map((i) => i.id)).toEqual([a.id, b.id, c.id])
      const keys = items.map((i) => i.orderKey)
      expect([...keys].sort()).toEqual(keys)
    })
  })

  describe('items — moveItem', () => {
    it('updates status and order_key and completedAt when moving to terminal', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A' })
      const moved = repo.moveItem(item.id, 'done', 'zz')
      expect(moved.status).toBe('done')
      expect(moved.orderKey).toBe('zz')
      expect(moved.completedAt).not.toBeNull()
    })
  })

  describe('cascade + set null', () => {
    it('deleteProject cascades to its items', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'A' })
      repo.deleteProject(project.id)
      expect(repo.getItem(item.id) ?? null).toBeNull()
    })

    it('deleteTemplate sets item templateId to null but keeps the item', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const template = repo.createTemplate({ name: 'T', body: 'body' })
      const item = repo.createItem({
        projectId: project.id,
        title: 'A',
        templateId: template.id
      })
      repo.deleteTemplate(template.id)
      const fetched = repo.getItem(item.id)
      expect(fetched).not.toBeNull()
      expect(fetched?.templateId).toBeNull()
    })
  })

  describe('items — session pointer', () => {
    it('defaults sessionId to null and round-trips setSessionId', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'T' })
      expect(item.sessionId).toBeNull()
      const updated = repo.setSessionId(item.id, 'sess-1')
      expect(updated.sessionId).toBe('sess-1')
      expect(repo.getItem(item.id)?.sessionId).toBe('sess-1')
    })
  })

  describe('items — workspace binding', () => {
    it('persists workspace project, name, and preferred agent', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({
        projectId: project.id,
        title: 'T',
        workspaceProjectId: 'proj-1',
        workspaceName: 'feature-x',
        preferredAgent: 'claude'
      })
      expect(item.workspaceProjectId).toBe('proj-1')
      expect(item.workspaceName).toBe('feature-x')
      expect(item.preferredAgent).toBe('claude')

      const updated = repo.updateItem(item.id, {
        workspaceName: 'feature-y',
        preferredAgent: null
      })
      expect(updated.workspaceProjectId).toBe('proj-1')
      expect(updated.workspaceName).toBe('feature-y')
      expect(updated.preferredAgent).toBeNull()
    })
  })

  describe('items — autoPilot fields', () => {
    it('defaults autoPilotEnabled=false and autoPilotMaxTurns=null on create', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const item = repo.createItem({ projectId: project.id, title: 'x' })
      expect(item.autoPilotEnabled).toBe(false)
      expect(item.autoPilotMaxTurns).toBeNull()
    })

    it('round-trips autoPilot fields through create + update', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const created = repo.createItem({
        projectId: project.id,
        title: 'x',
        autoPilotEnabled: true,
        autoPilotMaxTurns: 7
      })
      expect(created.autoPilotEnabled).toBe(true)
      expect(created.autoPilotMaxTurns).toBe(7)
      const updated = repo.updateItem(created.id, {
        autoPilotEnabled: false,
        autoPilotMaxTurns: null
      })
      expect(updated.autoPilotEnabled).toBe(false)
      expect(updated.autoPilotMaxTurns).toBeNull()
    })

    it('listAutoPilotCandidates returns only status=todo && autoPilotEnabled across projects', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const eligible = repo.createItem({
        projectId: project.id,
        title: 'eligible',
        status: 'todo',
        autoPilotEnabled: true
      })
      repo.createItem({ projectId: project.id, title: 'todo-no-flag', status: 'todo' })
      repo.createItem({
        projectId: project.id,
        title: 'backlog-flag',
        status: 'backlog',
        autoPilotEnabled: true
      })
      const candidates = repo.listAutoPilotCandidates()
      expect(candidates.map((c) => c.id)).toEqual([eligible.id])
    })
  })

  describe('templates CRUD', () => {
    it('creates, lists, updates and deletes templates', () => {
      const repo = createRepo()
      const template = repo.createTemplate({ name: 'T', body: 'body' })
      expect(template.id).toBeTruthy()
      expect(repo.listTemplates()).toHaveLength(1)

      const renamed = repo.updateTemplate({ id: template.id, name: 'T2' })
      expect(renamed.name).toBe('T2')
      expect(renamed.body).toBe('body')

      const rebodied = repo.updateTemplate({ id: template.id, body: 'body2' })
      expect(rebodied.name).toBe('T2')
      expect(rebodied.body).toBe('body2')

      repo.deleteTemplate(template.id)
      expect(repo.listTemplates()).toHaveLength(0)
    })
  })
})
