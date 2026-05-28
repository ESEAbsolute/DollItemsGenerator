import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const packTemplateDir = path.join(projectRoot, 'public', 'pack_template')
const manifestPath = path.join(packTemplateDir, 'manifest.json')

async function collectRelativePaths(directory, baseDirectory = directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const relativePaths = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      relativePaths.push(...await collectRelativePaths(fullPath, baseDirectory))
      continue
    }

    const relativePath = path.relative(baseDirectory, fullPath).split(path.sep).join('/')

    if (relativePath === 'manifest.json') {
      continue
    }

    relativePaths.push(relativePath)
  }

  return relativePaths
}

const manifest = (await collectRelativePaths(packTemplateDir)).sort((left, right) =>
  left.localeCompare(right, 'en')
)

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(`Generated pack template manifest with ${manifest.length} entries.`)
