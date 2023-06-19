import fs from 'fs'
import yaml from 'js-yaml'
import * as path from 'path'
import { contractsTemplate } from './contracts.template'
import os from 'os'
import * as tar from 'tar'

export { path, fs }
export { $ } from 'zx-cjs'
export {createLogger, getLogger, getTestingLogger} from './logger'

export { UrlResolver } from './url.js'

/** Expand the first ~ to the user home dir in a path. Throw and error if no $HOME env var is set */
export function expandUserHomeDir(path: string): string {
  if (/^~/.test(path)) {
    return path.replace(
      /^~/,
      process.env.HOME ??
        (() => {
          throw Error('cannot expand user home dir ~')
        })()
    )
  } else if (/^\$HOME/.test(path)) {
    return path.replace(
      /^\$HOME/,
      process.env.HOME ??
        (() => {
          throw Error('cannot expand user home dir ~')
        })()
    )
  }
  return path
}

/** Given a list of dir paths, return an absolute path.
 * Same behavior as NodeJS path.resolve except that each path component is expanded with user home dir where applicable.
 */
export function resolveToAbsDir(...dirPaths: string[]): string {
  const expanded = dirPaths.map(expandUserHomeDir)
  return path.resolve(...expanded)
}

/** Recursively delete a directory and its children if the directory/children exist.
 * Also works for a regular file. Behavior similar to `rm -rf`
 */
export function rmDir(dir: string, opts?: object): void {
  if (fs.existsSync(dir)) {
    const rmOpts = Object.assign({ recursive: true, force: true }, opts)
    fs.rmSync(dir, rmOpts)
    // try { fs.rmSync(dir, rmOpts) } catch (err) {} // ignore error if dir not exist
  }
}

/** Remove all children of a directory.
 * Throw an error if the path is not a directory.
 */
export function rmDirChildren(dir: string) {
  if (!fs.existsSync(dir)) {
    return
  }
  for (const child of fs.readdirSync(dir)) {
    rmDir(path.join(dir, child))
  }
}

/** Ensure a directory exists. Create if necessary.
 * If recursive = true, then behavior similar to mkdir -p /parent/folder/will/be/created
 */
export function ensureDir(dir: string, recursive: boolean = false): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: recursive })
  }
  return dir
}

export function readYamlFile(path: string): any {
  return yaml.load(fs.readFileSync(path))
}

export function readYamlText(text: string): any {
  return yaml.load(text)
}

/**
 * load an object from a yaml file or content string
 * @param pathOrText a file path or a yaml string
 * @returns an parsed object or list
 */
export function readYaml(pathOrText: string): any {
  const isPath = !pathOrText.includes('\n') && fs.existsSync(pathOrText)
  return isPath ? readYamlFile(pathOrText) : readYamlText(pathOrText)
}

export function dumpYaml(obj, opts = { noRefs: true }): string {
  return yaml.dump(obj, opts)
}

export function dumpYamlToFile(filepath: string, obj, opts = { noRefs: true }, safeDump = false) {
  const content = safeDump ? dumpYamlSafe(obj) : dumpYaml(obj, opts)
  fs.writeFileSync(filepath, content)
}

export function dumpYamlSafe(obj): string {
  const textWithFuncRemoved = JSON.stringify(obj)
  const strippedObj = yaml.load(textWithFuncRemoved)
  return yaml.dump(strippedObj)
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ignore unused variables. this cancel the ts compiler errors for unused variables.
// NEVER call this in production release.
export function ignoreUnused(...args: any[]) {
  if (typeof args === 'undefined') {
    if (typeof args !== 'undefined') {
      console.log(args)
    }
  }
}

/**
 * Return a file path based on relative path pattern and current file path.
 * @param relativePath a relative path
 * @param currentFilePath current file path. Default to caller's current file path.
 * @returns a resolved path without `file:///` prefix
 */
export function getRelativeFilePath(
  relativePath: string,
  // currentFilePath: string = import.meta.url // ESM
  currentFilePath: string = __filename
): string {
  // ESM
  // const url = new URL(relativePath, currentFilePath)
  // return fileURLToPath(url)

  // CJS
  return path.normalize(path.join(path.dirname(currentFilePath), relativePath))
}

export async function waitUntil(checkFunc: () => Promise<boolean>, retry: number, intervalMs: number, msg = '') {
  for (let i = 0; i < retry; i++) {
    await sleep(intervalMs)
    const ready = await checkFunc()
    if (ready) {
      return true
    }
  }
  throw new Error(`failed after ${retry} retries.\n${msg}`)
}

export async function extractSmartContracts(contractsDir: string): Promise<void> {
  // Create a unique temporary directory
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'contracts-'))

  // Write the decoded template to a temporary tar file
  const tempTarPath = path.join(tempDir, 'temp.tar')

  try {
    // Decode the base64-encoded contracts template
    const decodedTemplate = Buffer.from(contractsTemplate.trim(), 'base64')

    fs.writeFileSync(tempTarPath, decodedTemplate, 'binary')

    // Extract the tar file contents into the contracts directory
    await tar.extract({
      strip: 4,
      file: tempTarPath,
      cwd: contractsDir
    })
  } finally {
    // Delete the temporary tar file and directory
    fs.unlinkSync(tempTarPath)
    fs.rmdirSync(tempDir)
  }
}
