import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/orca-user-data'
  }
}))

import { AmpHookService } from '../amp/hook-service'
import { createFakeSftp } from './remote-hook-service-installers-test-fixtures'

describe('remote hook service installers — Amp', () => {
  it('does not overwrite a remote user-authored Amp plugin file', async () => {
    const { sftp, fs } = createFakeSftp({
      '/home/dev/.config/amp/plugins/orca-agent-status.ts':
        'export default function userPlugin() {}\n'
    })

    const status = await new AmpHookService().installRemote(sftp, '/home/dev/')

    expect(status).toMatchObject({
      agent: 'amp',
      state: 'partial',
      managedHooksPresent: false
    })
    expect(fs.files.get('/home/dev/.config/amp/plugins/orca-agent-status.ts')).toBe(
      'export default function userPlugin() {}\n'
    )
  })
})
