import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const localesDir = path.join(projectRoot, 'public', 'locales')
const localeFiles = ['zh_cn.json', 'en_us.json', 'zh_hk.json']

async function loadLocale(fileName) {
  const fullPath = path.join(localesDir, fileName)
  const raw = await readFile(fullPath, 'utf8')
  return JSON.parse(raw)
}

const localeEntries = await Promise.all(
  localeFiles.map(async (fileName) => [fileName, await loadLocale(fileName)])
)

const locales = Object.fromEntries(localeEntries)
const allKeys = [...new Set(Object.values(locales).flatMap((messages) => Object.keys(messages)))].sort()
const warnings = []

for (const [fileName, messages] of Object.entries(locales)) {
  for (const key of allKeys) {
    if (!(key in messages)) {
      warnings.push(`${fileName} 缺少翻译键: ${key}`)
      continue
    }

    const value = messages[key]
    if (typeof value !== 'string' || !value.trim()) {
      warnings.push(`${fileName} 的翻译键为空: ${key}`)
    }
  }
}

if (!warnings.length) {
  console.log('i18n check passed: no missing translation keys.')
  process.exit(0)
}

for (const warning of warnings) {
  console.log(`::warning::${warning}`)
}

console.log(`i18n check completed with ${warnings.length} warning(s).`)
process.exit(0)
