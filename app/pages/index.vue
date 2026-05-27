<script setup lang="ts">
import ItemRow from '../components/ItemRow.vue'
import type { AppLocale } from '../composables/useAppI18n'
import { useAppI18n } from '../composables/useAppI18n'
import type { ItemRowData, ModelPresetCatalog, SkinModel } from '../composables/usePackGenerator'
import {
  DEFAULT_MODEL_TYPE_ID,
  usePackGenerator
} from '../composables/usePackGenerator'

const rows = ref<ItemRowData[]>([])
const errorMessage = ref('')
const isGenerating = ref(false)
const activeDownloadUrl = ref<string | null>(null)
const presetCatalog = ref<ModelPresetCatalog | null>(null)
const { currentLocale, initI18n, loadLocale, localeOptions, t } = useAppI18n()

const {
  createDemoRow,
  createEmptyRow,
  inferSkinModelFromUrl,
  loadModelPresetCatalog,
  prepareSkinUpload,
  prepareServerOverride,
  revokePreviewUrl,
  generatePack
} = usePackGenerator()

onMounted(async () => {
  try {
    await initI18n()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  }

  try {
    presetCatalog.value = await loadModelPresetCatalog()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  }

  const defaultModelTypeId = presetCatalog.value?.presets[0]?.id ?? DEFAULT_MODEL_TYPE_ID
  const demoRow = createDemoRow(defaultModelTypeId)
  rows.value = [demoRow]

  try {
    if (!demoRow.skinAssetUrl) {
      throw new Error('无法读取默认示例皮肤。')
    }
    const inferred = await inferSkinModelFromUrl(demoRow.skinAssetUrl)
    demoRow.skinModel = inferred
    demoRow.inferredModel = inferred
  } catch (error) {
    demoRow.lastValidationError = toErrorMessage(error)
  }
})

onBeforeUnmount(() => {
  rows.value.forEach((row) => revokePreviewUrl(row))
  if (activeDownloadUrl.value) {
    URL.revokeObjectURL(activeDownloadUrl.value)
  }
})

const updateItemId = (id: string, value: string) => {
  patchRow(id, (row) => {
    row.itemId = value
    row.lastValidationError = null
  })
}

const updateModel = (id: string, value: SkinModel) => {
  patchRow(id, (row) => {
    row.skinModel = value
    row.lastValidationError = null
  })
}

const updateModelType = (id: string, value: string) => {
  patchRow(id, (row) => {
    row.modelTypeId = value
    row.lastValidationError = null
  })
}

const updateOverrideText = (id: string, value: string) => {
  patchRow(id, (row) => {
    row.serverOverrideText = value
    if (value.trim()) {
      row.serverOverrideName = row.serverOverrideName || 'manual-override.json'
    } else {
      row.serverOverrideFile = null
      row.serverOverrideName = null
    }
    row.lastValidationError = null
  })
}

const addRow = () => {
  const defaultModelTypeId = presetCatalog.value?.presets[0]?.id ?? DEFAULT_MODEL_TYPE_ID
  rows.value.push(createEmptyRow(defaultModelTypeId))
  errorMessage.value = ''
}

const removeRow = (id: string) => {
  const target = rows.value.find((row) => row.id === id)
  if (!target) {
    return
  }

  revokePreviewUrl(target)
  rows.value = rows.value.filter((row) => row.id !== id)
  if (!rows.value.length) {
    const defaultModelTypeId = presetCatalog.value?.presets[0]?.id ?? DEFAULT_MODEL_TYPE_ID
    rows.value = [createEmptyRow(defaultModelTypeId)]
  }

  errorMessage.value = ''
}

const uploadSkin = async (id: string, file: File) => {
  try {
    const result = await prepareSkinUpload(file)
    patchRow(id, (row) => {
      revokePreviewUrl(row)
      row.skinSource = 'upload'
      row.skinFile = file
      row.skinFileName = result.fileName
      row.skinPreviewUrl = result.previewUrl
      row.skinAssetUrl = null
      row.inferredModel = result.inferredModel
      row.skinModel = result.inferredModel
      row.lastValidationError = null
    })
    errorMessage.value = ''
  } catch (error) {
    patchRow(id, (row) => {
      row.lastValidationError = toErrorMessage(error)
    })
  }
}

const uploadOverride = async (id: string, file: File) => {
  try {
    const row = rows.value.find((item) => item.id === id)
    if (!row) {
      return
    }

    const result = await prepareServerOverride(file, row.itemId)
    patchRow(id, (row) => {
      row.serverOverrideFile = file
      row.serverOverrideName = result.fileName
      row.serverOverrideText = result.text
      row.lastValidationError = null
    })
    errorMessage.value = ''
  } catch (error) {
    patchRow(id, (row) => {
      row.lastValidationError = toErrorMessage(error)
    })
  }
}

const downloadPack = async () => {
  isGenerating.value = true
  errorMessage.value = ''

  try {
    if (!presetCatalog.value) {
      presetCatalog.value = await loadModelPresetCatalog()
    }

    rows.value.forEach((row) => {
      row.lastValidationError = null
    })

    const result = await generatePack(rows.value, presetCatalog.value)
    if (activeDownloadUrl.value) {
      URL.revokeObjectURL(activeDownloadUrl.value)
    }
    activeDownloadUrl.value = result.downloadUrl

    const anchor = document.createElement('a')
    anchor.href = result.downloadUrl
    anchor.download = result.fileName
    anchor.click()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
  } finally {
    isGenerating.value = false
  }
}

function patchRow(id: string, updater: (row: ItemRowData) => void) {
  const target = rows.value.find((row) => row.id === id)
  if (target) {
    updater(target)
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : t('app.error.unknown')
}

const switchLocale = async (locale: AppLocale) => {
  await loadLocale(locale)
}

useHead(() => ({
  title: t('app.title', 'Minecraft Item Doll Generator'),
  meta: [
    {
      name: 'description',
      content: t('app.description')
    }
  ]
}))
</script>

<template>
  <main class="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-8 sm:px-6 lg:px-8">
    <section class="panel rounded-[2rem] p-6 sm:p-8">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {{ t('app.title') }}
          </h1>
          <p class="mt-4 max-w-3xl whitespace-pre-line text-sm leading-7 text-zinc-300 sm:text-base">
            {{ t('app.hero.body') }}
          </p>
        </div>
        <label class="field-shell min-w-[11rem]">
          <span class="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {{ t('component.locale.label') }}
          </span>
          <select
            :value="currentLocale"
            class="text-field cursor-pointer"
            @change="switchLocale(($event.target as HTMLSelectElement).value as AppLocale)"
          >
            <option v-for="locale in localeOptions" :key="locale.code" :value="locale.code">
              {{ locale.label }}
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="mt-8 panel rounded-[2rem] p-4 sm:p-6">
      <div class="flex flex-col gap-4 border-b border-zinc-800/90 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <h2 class="text-xl font-semibold text-white">
          {{ t('app.list.title') }}
        </h2>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="action-button border border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800"
            :disabled="isGenerating"
            @click="addRow"
          >
            {{ t('app.action.add_row') }}
          </button>
          <button
            type="button"
            class="action-button bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
            :disabled="isGenerating"
            @click="downloadPack"
          >
            {{ isGenerating ? t('app.action.generating') : t('app.action.generate') }}
          </button>
        </div>
      </div>

      <div class="mt-6 space-y-4">
        <ItemRow
          v-for="row in rows"
          :key="row.id"
          :row="row"
          :busy="isGenerating"
          :removable="rows.length > 1"
            :model-presets="presetCatalog?.presets ?? []"
          @remove="removeRow"
          @update:item-id="updateItemId"
          @update:model="updateModel"
            @update:model-type="updateModelType"
            @update:override-text="updateOverrideText"
          @upload:override="uploadOverride"
          @upload:skin="uploadSkin"
        />
      </div>
      <p v-if="errorMessage" class="mt-5 text-sm text-red-300">
        {{ errorMessage }}
      </p>
    </section>
  </main>
</template>
