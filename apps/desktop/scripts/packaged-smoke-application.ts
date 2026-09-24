/** Materialize a Windows packaged application at an installation-like short path for runtime smoke tests. */

import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Run a packaged-runtime smoke action against the original application or a short-lived Windows copy.
 *
 * LibreOfficeKit's Windows bootstrap can report existing files as missing when its unnormalized resource path
 * approaches the legacy MAX_PATH limit. Installed applications normally have a shorter path than the build tree.
 *
 * @param application Packaged application directory.
 * @param windows Whether the package targets Windows.
 * @param smoke Runtime verification to execute against the selected directory.
 * @returns The smoke action result.
 */
export async function withPackagedSmokeApplication<T>(
  application: string, windows: boolean, smoke: (application: string) => Promise<T>,
): Promise<T> {
  if (!windows) return smoke(application)
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-packaged-smoke-'))
  const staged = join(temporary, 'app')
  try {
    await cp(application, staged, { recursive: true, errorOnExist: true })
    return await smoke(staged)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
