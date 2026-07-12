import { afterEach, describe, expect, it } from 'vitest'
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

    it('listProjects returns created projects', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const list = repo.listProjects()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(project.id)
    })

    it('renameProject changes name and updatedAt', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      const renamed = repo.renameProject({ id: project.id, name: 'Renamed' })
      expect(renamed.name).toBe('Renamed')
      expect(renamed.updatedAt >= project.updatedAt).toBe(true)
    })

    it('deleteProject removes it', () => {
      const repo = createRepo()
      const project = makeProject(repo)
      repo.deleteProject(project.id)
      expect(repo.listProjects()).toHaveLength(0)
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
