/** Resolve packaged Office engine manifests from their complete, unpacked resource directories. */
import { realpathSync } from 'node:fs'
import { createRequire, registerHooks, type ModuleHooks } from 'node:module'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

type ResolveFilename = (request: string, parent: object | null, isMain: boolean, options?: object) => string

type NodeModuleApi = { _resolveFilename: ResolveFilename }

const nodeModule = createRequire(import.meta.url)('node:module') as NodeModuleApi

function inside(root: string, path: string): boolean {
  const suffix = relative(root, path)
  return suffix !== '..' && suffix !== '' && !suffix.startsWith(`..${sep}`) && !suffix.includes(`:${sep}`)
}

function isEngineSpecifier(specifier: string): boolean {
  return /^@deepseek-ai\/libreoffice-kit-(?:darwin|win32|linux)-/u.test(specifier)
}

function physicalEnginePath(resolvedPath: string, archive: string, root: string): string {
  const canonical = realpathSync(resolvedPath)
  if (!inside(root, canonical)) {
    if (inside(archive, canonical)) {
      throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolvedPath}`)
    }
    return resolvedPath
  }
  const physical = join(`${archive}.unpacked`, relative(archive, root), relative(root, canonical))
  return realpathSync(physical)
}

/**
 * Locate the archive containing a packaged runtime.
 * @param runtimeDir - Prepared or ASAR-contained runtime directory.
 * @returns Parent archive path, or undefined for a prepared directory.
 */
export function runtimeArchivePath(runtimeDir: string): string | undefined {
  const parent = dirname(runtimeDir)
  return basename(parent) === 'app.asar' ? parent : undefined
}

/**
 * Keep engine executable and resource paths usable by native child processes outside Electron.
 * Hooks apply only to this thread; worker threads must install their own resolver.
 * @param runtimeDir - Prepared or ASAR-contained dsh runtime directory.
 * @returns Installed resolver for the Host lifetime, or undefined for a non-ASAR runtime.
 */
export function installOfficeEngineResolution(runtimeDir: string): ModuleHooks | undefined {
  if (runtimeArchivePath(runtimeDir) === undefined) return undefined
  const archiveCandidate = dirname(runtimeDir)
  const archive = basename(archiveCandidate) === 'app.asar' ? archiveCandidate : realpathSync(archiveCandidate)
  const root = join(archive, basename(runtimeDir))
  const originalResolveFilename = nodeModule._resolveFilename
  const resolveFilename: ResolveFilename = (request, parent, isMain, options) => {
    const resolved = originalResolveFilename(request, parent, isMain, options)
    const physical = isEngineSpecifier(request) ? physicalEnginePath(resolved, archive, root) : resolved
    if (process.env.DSH_DESKTOP_OFFICE_TRACE === '1' && isEngineSpecifier(request)) {
      console.log(`desktop Office engine require.resolve: ${resolved} -> ${physical}`)
    }
    return physical
  }
  nodeModule._resolveFilename = resolveFilename
  const source = pathToFileURL(join(root, 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const destination = pathToFileURL(join(`${archive}.unpacked`, relative(archive, root), 'node_modules', '@deepseek-ai', 'libreoffice-kit-')).href
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context)
      if (!isEngineSpecifier(specifier)) return resolved
      const canonical = pathToFileURL(realpathSync(fileURLToPath(resolved.url))).href
      if (!canonical.startsWith(source)) {
        if (canonical.startsWith(pathToFileURL(archive + '/').href)) {
          throw new Error(`desktop Office engine resolved outside the runtime package directory: ${resolved.url}`)
        }
        return resolved
      }
      const physical = realpathSync(fileURLToPath(destination + canonical.slice(source.length)))
      if (process.env.DSH_DESKTOP_OFFICE_TRACE === '1') {
        console.log(`desktop Office engine import: ${resolved.url} -> ${physical}`)
      }
      return { ...resolved, url: pathToFileURL(physical).href }
    },
  })
  return {
    deregister() {
      hooks.deregister()
      if (nodeModule._resolveFilename === resolveFilename) nodeModule._resolveFilename = originalResolveFilename
    },
  }
}
