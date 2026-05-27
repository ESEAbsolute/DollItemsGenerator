import JSZip from 'jszip'

export type SkinModel = 'steve' | 'alex'
export type SkinSource = 'builtin' | 'upload' | null

export interface ItemRowData {
  id: string
  itemId: string
  skinModel: SkinModel | null
  modelTypeId: string | null
  skinSource: SkinSource
  skinFile: File | null
  skinFileName: string | null
  skinPreviewUrl: string | null
  skinAssetUrl: string | null
  serverOverrideFile: File | null
  serverOverrideName: string | null
  serverOverrideText: string
  inferredModel: SkinModel | null
  lastValidationError: string | null
}

export interface ParsedItemId {
  namespace: string
  key: string
  assetStem: string
}

export interface PreparedSkinUpload {
  inferredModel: SkinModel
  previewUrl: string
  fileName: string
}

export interface PreparedServerOverride {
  fileName: string
  text: string
}

export interface PackGenerationResult {
  fileName: string
  downloadUrl: string
  itemCount: number
}

export interface ModelPresetDefinition {
  id: string
  previewImage: string
  declaration: JsonTemplateValue
  generation: GeneratedModelTemplate[]
}

export interface ModelPresetCatalog {
  presets: ModelPresetDefinition[]
  byId: Record<string, ModelPresetDefinition>
}

interface GeneratedModelTemplate {
  path: string
  content: JsonTemplateValue
}

interface RawModelPresetDefinition {
  declaration: JsonTemplateValue
  generation: GeneratedModelTemplate[]
}

interface TemplateContext {
  namespace: string
  key: string
  assetStem: string
  skinType: SkinModel
  templateType: string
  id: string
}

type GeneratedFileMap = Record<string, string | Uint8Array>
type JsonObject = Record<string, unknown>
type JsonTemplatePrimitive = string | number | boolean | null
type JsonTemplateValue = JsonTemplatePrimitive | JsonTemplateValue[] | { [key: string]: JsonTemplateValue }

const PNG_NAME_PATTERN = /\.png$/i
const JSON_NAME_PATTERN = /\.json$/i
const FULL_ITEM_ID_PATTERN = /^[a-z0-9._-]+:[a-z0-9._/-]+$/
const KEY_ONLY_ITEM_ID_PATTERN = /^[a-z0-9._/-]+$/
const MODEL_SAMPLE_POINTS = [
  [51, 17],
  [55, 31],
  [43, 49],
  [47, 63],
  [55, 39],
  [63, 55]
] as const

let presetCatalogPromise: Promise<ModelPresetCatalog> | null = null

export const DEFAULT_MODEL_TYPE_ID = 'holding_item'
export const DEFAULT_DEMO_SKIN_URL = '/skins/default-alex-skin.png'
export const DEFAULT_TOTEM_OVERRIDE_TEXT = JSON.stringify(
  {
    model: {
      type: 'minecraft:condition',
      property: 'minecraft:component',
      predicate: 'minecraft:enchantments',
      value: [{ enchantments: 'example_server:attribute/supreme_totem' }],
      on_true: {
        type: 'minecraft:model',
        model: 'example_server:item/supreme_totem'
      },
      on_false: {
        type: 'minecraft:model',
        model: 'minecraft:item/totem_of_undying'
      }
    }
  },
  null,
  2
)

export function createEmptyRow(defaultModelTypeId: string | null = DEFAULT_MODEL_TYPE_ID): ItemRowData {
  return {
    id: crypto.randomUUID(),
    itemId: '',
    skinModel: null,
    modelTypeId: defaultModelTypeId,
    skinSource: null,
    skinFile: null,
    skinFileName: null,
    skinPreviewUrl: null,
    skinAssetUrl: null,
    serverOverrideFile: null,
    serverOverrideName: null,
    serverOverrideText: '',
    inferredModel: null,
    lastValidationError: null
  }
}

export function createDemoRow(defaultModelTypeId: string = DEFAULT_MODEL_TYPE_ID): ItemRowData {
  return {
    ...createEmptyRow(defaultModelTypeId),
    itemId: 'minecraft:totem_of_undying',
    skinModel: 'alex',
    skinSource: 'builtin',
    skinFileName: 'default-alex-skin.png',
    skinPreviewUrl: DEFAULT_DEMO_SKIN_URL,
    skinAssetUrl: DEFAULT_DEMO_SKIN_URL,
    serverOverrideName: 'totem_of_undying.json',
    serverOverrideText: DEFAULT_TOTEM_OVERRIDE_TEXT,
    inferredModel: 'alex'
  }
}

export async function loadModelPresetCatalog(forceRefresh = false): Promise<ModelPresetCatalog> {
  if (!presetCatalogPromise || forceRefresh) {
    presetCatalogPromise = fetchModelPresetCatalog()
  }

  return presetCatalogPromise
}

export function parseItemId(itemId: string): ParsedItemId {
  const normalized = itemId.trim().toLowerCase()
  const withDefaultNamespace = normalized.includes(':') ? normalized : `minecraft:${normalized}`
  if (!FULL_ITEM_ID_PATTERN.test(withDefaultNamespace) || (!normalized.includes(':') && !KEY_ONLY_ITEM_ID_PATTERN.test(normalized))) {
    throw new Error('物品 ID 需要填写物品 key，或完整的 namespace:key 格式，例如 golden_apple 或 minecraft:golden_apple。')
  }

  const separatorIndex = withDefaultNamespace.indexOf(':')
  const namespace = withDefaultNamespace.slice(0, separatorIndex)
  const key = withDefaultNamespace.slice(separatorIndex + 1)
  return {
    namespace,
    key,
    assetStem: sanitizeAssetSegment(namespace === 'minecraft' ? key : `${namespace}__${key}`)
  }
}

export function buildPlayerDollDeclaration(
  parsed: ParsedItemId,
  preset: ModelPresetDefinition,
  skinType: SkinModel
): JsonObject {
  return resolveTemplateValue(preset.declaration, {
    namespace: parsed.namespace,
    key: parsed.key,
    assetStem: parsed.assetStem,
    skinType,
    templateType: preset.id,
    id: preset.id
  }) as JsonObject
}

export function mergeServerOverrideJson(
  sourceText: string,
  parsed: ParsedItemId,
  replacementModel: JsonObject
): JsonObject {
  const parsedJson = JSON.parse(sourceText) as JsonObject
  const clone = cloneJson(parsedJson)
  const candidates = getOverrideModelCandidates(parsed)
  const replacementNode = extractReplacementModelNode(replacementModel)

  if (isModelObject(clone) && candidates.has(clone.model)) {
    return replacementNode
  }

  if (!replaceModelNode(clone, candidates, replacementNode)) {
    return replacementModel
  }

  return clone
}

export function inferSkinModelFromImageData(imageData: ImageData): SkinModel {
  const transparentCount = MODEL_SAMPLE_POINTS.reduce((count, [x, y]) => {
    const index = (y * imageData.width + x) * 4 + 3
    return count + (imageData.data[index] === 0 ? 1 : 0)
  }, 0)

  return transparentCount > 3 ? 'alex' : 'steve'
}

export function buildGeneratedFiles(
  row: ItemRowData,
  preset: ModelPresetDefinition
): GeneratedFileMap {
  const parsed = parseItemId(row.itemId)
  if (!row.skinModel) {
    throw new Error(`物品 ${row.itemId} 尚未选择皮肤模型。`)
  }

  const declaration = buildPlayerDollDeclaration(parsed, preset, row.skinModel)
  const files: GeneratedFileMap = {}
  const context: TemplateContext = {
    namespace: parsed.namespace,
    key: parsed.key,
    assetStem: parsed.assetStem,
    skinType: row.skinModel,
    templateType: preset.id,
    id: preset.id
  }

  const validatedOverrideText = row.serverOverrideText.trim()
    ? prepareServerOverrideText(row.serverOverrideText, row.itemId)
    : ''

  files[`assets/${parsed.namespace}/items/${parsed.key}.json`] = formatJson(
    validatedOverrideText
      ? mergeServerOverrideJson(validatedOverrideText, parsed, declaration)
      : declaration
  )

  for (const template of preset.generation) {
    const filePath = resolveTemplateString(template.path, context)
    const content = resolveTemplateValue(template.content, context)
    files[filePath] = formatJson(content)
  }

  return files
}

export function usePackGenerator() {
  const prepareSkinUpload = async (file: File): Promise<PreparedSkinUpload> => {
    if (!PNG_NAME_PATTERN.test(file.name)) {
      throw new Error('仅支持上传 PNG 皮肤图片。')
    }

    const imageData = await readImageData(file)
    if (imageData.width !== 64 || imageData.height !== 64) {
      throw new Error('仅支持 64x64 标准皮肤图片。')
    }

    return {
      inferredModel: inferSkinModelFromImageData(imageData),
      previewUrl: URL.createObjectURL(file),
      fileName: file.name
    }
  }

  const prepareServerOverride = async (file: File, itemId: string): Promise<PreparedServerOverride> => {
    if (!JSON_NAME_PATTERN.test(file.name)) {
      throw new Error('服务器物品模型映射仅支持上传 JSON 文件。')
    }

    const text = await file.text()
    return {
      fileName: file.name,
      text: prepareServerOverrideText(text, itemId)
    }
  }

  const inferSkinModelFromUrl = async (url: string): Promise<SkinModel> => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('无法读取默认示例皮肤。')
    }

    return inferSkinModelFromImageData(await readImageData(await response.blob()))
  }

  const revokePreviewUrl = (row: ItemRowData) => {
    if (row.skinSource === 'upload' && row.skinPreviewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(row.skinPreviewUrl)
    }
  }

  const generatePack = async (
    rows: ItemRowData[],
    presetCatalog: ModelPresetCatalog
  ): Promise<PackGenerationResult> => {
    if (!rows.length) {
      throw new Error('请至少保留一条物品配置。')
    }

    const itemIds = new Set<string>()
    const zip = new JSZip()
    const baseFiles = await fetchPackTemplateFiles()

    for (const [path, content] of Object.entries(baseFiles)) {
      zip.file(path, content)
    }

    for (const row of rows) {
      const parsed = parseItemId(row.itemId)
      const normalizedItemId = `${parsed.namespace}:${parsed.key}`
      const preset = row.modelTypeId ? presetCatalog.byId[row.modelTypeId] : undefined
      if (!preset) {
        throw new Error(`物品 ${row.itemId || '(未命名)'} 尚未选择人偶模型预设。`)
      }
      if (!row.skinModel) {
        throw new Error(`物品 ${row.itemId || '(未命名)'} 尚未选择皮肤模型。`)
      }
      if (itemIds.has(normalizedItemId)) {
        throw new Error(`检测到重复物品 ID：${normalizedItemId}`)
      }
      itemIds.add(normalizedItemId)

      const generatedFiles = buildGeneratedFiles(row, preset)
      const skinBinary = await loadSkinBinary(row)
      const skinPath = `assets/playerdollitems/textures/item/doll/${row.skinModel}_${parsed.assetStem}.png`

      for (const [path, content] of Object.entries(generatedFiles)) {
        zip.file(path, content)
      }

      zip.file(skinPath, skinBinary)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    return {
      fileName: `minecraft-item-doll-pack-${Date.now()}.zip`,
      downloadUrl: URL.createObjectURL(blob),
      itemCount: rows.length
    }
  }

  return {
    createDemoRow,
    createEmptyRow,
    inferSkinModelFromUrl,
    loadModelPresetCatalog,
    prepareSkinUpload,
    prepareServerOverride,
    revokePreviewUrl,
    generatePack
  }
}

export function prepareServerOverrideText(sourceText: string, itemId: string) {
  const trimmed = sourceText.trim()
  if (!trimmed) {
    return ''
  }

  const parsedJson = JSON.parse(trimmed) as JsonObject
  const requiredModelReference = getRequiredOverrideModelReference(itemId)

  if (requiredModelReference && !containsModelCandidate(parsedJson, new Set([requiredModelReference]))) {
    throw new Error(`该 Json 中需要包含导向原版模型的 fallback，即需要包含 "${requiredModelReference}"。`)
  }

  return formatJson(parsedJson)
}

export function getRequiredOverrideModelReference(itemId: string) {
  try {
    const parsed = parseItemId(itemId)
    return `${parsed.namespace}:item/${parsed.key}`
  } catch {
    return null
  }
}

function sanitizeAssetSegment(input: string) {
  return input.replace(/[^a-z0-9._/-]+/g, '_').replace(/\//g, '_')
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function extractReplacementModelNode(replacementModel: JsonObject): JsonObject {
  const nestedModel = replacementModel.model
  if (
    Object.keys(replacementModel).length === 1 &&
    nestedModel &&
    typeof nestedModel === 'object' &&
    !Array.isArray(nestedModel)
  ) {
    return cloneJson(nestedModel as JsonObject)
  }

  return cloneJson(replacementModel)
}

async function fetchModelPresetCatalog(): Promise<ModelPresetCatalog> {
  const response = await fetch('/model-presets.json')
  if (!response.ok) {
    throw new Error('无法读取人偶模型预设配置。')
  }

  const raw = (await response.json()) as Record<string, RawModelPresetDefinition>
  const presets = Object.entries(raw).map(([templateType, definition]) => {
    return {
      id: templateType,
      previewImage: `/previews/${templateType}.png`,
      declaration: definition.declaration,
      generation: definition.generation
    }
  })

  const byId = presets.reduce<Record<string, ModelPresetDefinition>>((result, preset) => {
    result[preset.id] = preset
    return result
  }, {})

  return { presets, byId }
}

async function fetchPackTemplateFiles() {
  const manifestResponse = await fetch('/pack_template/manifest.json')
  if (!manifestResponse.ok) {
    throw new Error('无法读取 pack_template 资源清单。')
  }

  const manifest = (await manifestResponse.json()) as string[]
  const fileMap: GeneratedFileMap = {}

  await Promise.all(
    manifest.map(async (relativePath) => {
      const response = await fetch(`/pack_template/${relativePath}`)
      if (!response.ok) {
        throw new Error(`无法读取模板文件：${relativePath}`)
      }
      fileMap[relativePath] = new Uint8Array(await response.arrayBuffer())
    })
  )

  return fileMap
}

async function loadSkinBinary(row: ItemRowData) {
  if (row.skinSource === 'upload' && row.skinFile) {
    return new Uint8Array(await row.skinFile.arrayBuffer())
  }
  if (row.skinSource === 'builtin' && row.skinAssetUrl) {
    const response = await fetch(row.skinAssetUrl)
    if (!response.ok) {
      throw new Error(`无法读取示例皮肤：${row.skinAssetUrl}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  throw new Error(`物品 ${row.itemId || '(未命名)'} 缺少皮肤图片。`)
}

async function readImageData(fileOrBlob: Blob) {
  const url = URL.createObjectURL(fileOrBlob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('无法读取上传的皮肤图片。'))
      element.src = url
    })

    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('当前浏览器不支持 Canvas 皮肤识别。')
    }

    context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, image.width, image.height)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function resolveTemplateValue(value: JsonTemplateValue, context: TemplateContext): JsonTemplateValue {
  if (typeof value === 'string') {
    return resolveTemplateString(value, context)
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveTemplateValue(item, context)])
    )
  }
  return value
}

function resolveTemplateString(template: string, context: TemplateContext) {
  return template.replace(/\{\{(namespace|key|assetStem|skinType|templateType|id)\}\}/g, (_, token: keyof TemplateContext) => {
    return context[token]
  })
}

function replaceModelNode(
  node: unknown,
  candidates: Set<string>,
  replacementModel: JsonObject
): boolean {
  if (Array.isArray(node)) {
    return node.some((item, index) => {
      if (isModelObject(item) && candidates.has(item.model)) {
        node[index] = cloneJson(replacementModel)
        return true
      }
      return replaceModelNode(item, candidates, replacementModel)
    })
  }

  if (!node || typeof node !== 'object') {
    return false
  }

  const entries = Object.entries(node as JsonObject)
  for (const [key, value] of entries) {
    if (isModelObject(value) && candidates.has(value.model)) {
      ;(node as JsonObject)[key] = cloneJson(replacementModel)
      return true
    }

    if (replaceModelNode(value, candidates, replacementModel)) {
      return true
    }
  }

  return false
}

function isModelObject(value: unknown): value is { model: string } {
  return Boolean(value) && typeof value === 'object' && typeof (value as { model?: unknown }).model === 'string'
}

function containsModelCandidate(node: unknown, candidates: Set<string>): boolean {
  if (Array.isArray(node)) {
    return node.some((item) => containsModelCandidate(item, candidates))
  }

  if (!node || typeof node !== 'object') {
    return false
  }

  if (isModelObject(node) && candidates.has(node.model)) {
    return true
  }

  return Object.values(node).some((value) => containsModelCandidate(value, candidates))
}

function getOverrideModelCandidates(parsed: ParsedItemId) {
  return new Set([
    `${parsed.namespace}:item/${parsed.key}`
  ])
}
