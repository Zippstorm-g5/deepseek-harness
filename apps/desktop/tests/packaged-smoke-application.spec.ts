import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withPackagedSmokeApplication } from '../scripts/packaged-smoke-application.ts'

describe('packaged smoke application', () => {
  it('uses and removes a temporary Windows application copy', async () => {
    const fixture = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-fixture-'))
    const application = join(fixture, 'application')
    await mkdir(application)
    await writeFile(join(application, 'payload.txt'), 'packaged')
    let staged = ''
    try {
      expect(await withPackagedSmokeApplication(application, true, async (selected) => {
        staged = selected
        expect(selected).not.toBe(application)
        return readFile(join(selected, 'payload.txt'), 'utf8')
      })).toBe('packaged')
      await expect(access(staged)).rejects.toThrow()
      expect(await readFile(join(application, 'payload.txt'), 'utf8')).toBe('packaged')
    } finally {
      await rm(fixture, { recursive: true, force: true })
    }
  })

  it('uses a non-Windows application in place', async () => {
    expect(await withPackagedSmokeApplication('/application', false, async selected => selected))
      .toBe('/application')
  })
})
