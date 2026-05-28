<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type {
  ItemRowData,
  ModelPresetDefinition,
  SkinModel
} from '../composables/usePackGenerator'
import { getRequiredOverrideModelReference, parseItemId, prepareServerOverrideText } from '../composables/usePackGenerator'
import { useAppI18n } from '../composables/useAppI18n'

const props = defineProps<{
  row: ItemRowData
  modelPresets: ModelPresetDefinition[]
  busy?: boolean
  removable?: boolean
}>()

const emit = defineEmits<{
  'update:item-id': [id: string, value: string]
  'upload:skin': [id: string, file: File]
  'upload:override': [id: string, file: File]
  'update:model': [id: string, value: SkinModel]
  'update:model-type': [id: string, value: string]
  'update:override-text': [id: string, value: string]
  'remove': [id: string]
}>()

const isPresetOpen = ref(false)
const isOverrideOpen = ref(false)
const skinDropActive = ref(false)
const overrideDropActive = ref(false)
const skinDragDepth = ref(0)
const overrideDragDepth = ref(0)
const failedPreviewIds = ref<string[]>([])
const overrideDraft = ref('')
const overrideEditor = ref<HTMLTextAreaElement | null>(null)
const overrideHighlight = ref<HTMLElement | null>(null)
const { t } = useAppI18n()

const activePreset = computed(() => {
  return props.modelPresets.find((preset) => preset.id === props.row.modelTypeId) ?? null
})

const activePresetLabel = computed(() => {
  return activePreset.value ? t(`model.type.${activePreset.value.id}`, activePreset.value.id) : t('component.row.model_preset.empty')
})

const activeSkinTypeLabel = computed(() => {
  const currentModel = props.row.skinModel ?? props.row.inferredModel
  if (!currentModel) {
    return t('component.row.skin_upload.pending_detect')
  }
  return t(`skin.type.${currentModel}`)
})

const overrideDialogItemId = computed(() => {
  try {
    const parsed = parseItemId(props.row.itemId)
    return `${parsed.namespace}:${parsed.key}`
  } catch {
    return props.row.itemId.trim() || 'namespace:key'
  }
})

const overrideDialogTitle = computed(() => {
  return format(t('component.row.override.dialog_title'), {
    itemId: overrideDialogItemId.value
  })
})

const overrideDialogDesc = computed(() => {
  return format(t('component.row.override.dialog_desc'), {
    modelRef: getRequiredOverrideModelReference(props.row.itemId) ?? '{{namespace}}:item/{{key}}'
  })
})

const overrideDraftError = computed(() => {
  try {
    prepareServerOverrideText(overrideDraft.value, props.row.itemId)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : t('app.error.unknown')
  }
})

const highlightedOverrideHtml = computed(() => {
  const source = overrideDraft.value.trim() ? overrideDraft.value : '{}'
  return highlightJson(source)
})

watch(
  () => [props.row.serverOverrideText, isOverrideOpen.value] as const,
  ([serverOverrideText, open]) => {
    if (open) {
      overrideDraft.value = serverOverrideText
    }
  },
  { immediate: true }
)

watch(isOverrideOpen, (open) => {
  setPageScrollLocked(open)
})

const togglePresetBubble = () => {
  isOverrideOpen.value = false
  isPresetOpen.value = !isPresetOpen.value
}

const toggleOverrideBubble = () => {
  isPresetOpen.value = false
  if (!isOverrideOpen.value) {
    overrideDraft.value = props.row.serverOverrideText
  }
  isOverrideOpen.value = !isOverrideOpen.value
}

const closePresetBubble = () => {
  isPresetOpen.value = false
}

const closeOverrideBubble = () => {
  isOverrideOpen.value = false
}

onBeforeUnmount(() => {
  if (isOverrideOpen.value) {
    setPageScrollLocked(false)
  }
})

const onSkinChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('upload:skin', props.row.id, file)
  }
  input.value = ''
}

const onOverrideChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('upload:override', props.row.id, file)
  }
  input.value = ''
}

const onSkinDragEnter = (event: DragEvent) => {
  if (matchesDraggedFile(event, 'skin')) {
    skinDragDepth.value += 1
    skinDropActive.value = true
    event.preventDefault()
  }
}

const onSkinDragOver = (event: DragEvent) => {
  if (matchesDraggedFile(event, 'skin')) {
    event.preventDefault()
  }
}

const onSkinDragLeave = () => {
  skinDragDepth.value = Math.max(0, skinDragDepth.value - 1)
  if (skinDragDepth.value === 0) {
    skinDropActive.value = false
  }
}

const onSkinDrop = (event: DragEvent) => {
  event.preventDefault()
  skinDragDepth.value = 0
  skinDropActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && isAcceptedFile(file, 'skin')) {
    emit('upload:skin', props.row.id, file)
  }
}

const onOverrideDragEnter = (event: DragEvent) => {
  if (matchesDraggedFile(event, 'override')) {
    overrideDragDepth.value += 1
    overrideDropActive.value = true
    event.preventDefault()
  }
}

const onOverrideDragOver = (event: DragEvent) => {
  if (matchesDraggedFile(event, 'override')) {
    event.preventDefault()
  }
}

const onOverrideDragLeave = () => {
  overrideDragDepth.value = Math.max(0, overrideDragDepth.value - 1)
  if (overrideDragDepth.value === 0) {
    overrideDropActive.value = false
  }
}

const onOverrideDrop = (event: DragEvent) => {
  event.preventDefault()
  overrideDragDepth.value = 0
  overrideDropActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && isAcceptedFile(file, 'override')) {
    emit('upload:override', props.row.id, file)
  }
}

const onOverrideInput = (event: Event) => {
  overrideDraft.value = (event.target as HTMLTextAreaElement).value
  syncOverrideScroll()
}

const onOverrideScroll = () => {
  syncOverrideScroll()
}

const saveOverrideDraft = () => {
  try {
    const normalized = prepareServerOverrideText(overrideDraft.value, props.row.itemId)
    emit('update:override-text', props.row.id, normalized)
    closeOverrideBubble()
  } catch {
    // Keep the modal open; the computed error message already explains why saving is blocked.
  }
}

const toggleSkinModel = () => {
  if (props.busy) {
    return
  }

  const currentModel = props.row.skinModel ?? props.row.inferredModel ?? 'steve'
  emit('update:model', props.row.id, currentModel === 'steve' ? 'alex' : 'steve')
}

const markPreviewFailed = (presetId: string) => {
  if (!failedPreviewIds.value.includes(presetId)) {
    failedPreviewIds.value.push(presetId)
  }
}

const hasPreviewImage = (presetId: string) => {
  return !failedPreviewIds.value.includes(presetId)
}

function format(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? ''))
}

function highlightJson(source: string) {
  const escaped = escapeHtml(source)
  return escaped.replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?\b/g,
    (match, quoted: string, colon: string | undefined, keyword: string | undefined) => {
      if (quoted) {
        return `<span class="${colon ? 'json-token-key' : 'json-token-string'}">${match}</span>`
      }
      if (keyword) {
        return `<span class="json-token-boolean">${match}</span>`
      }
      return `<span class="json-token-number">${match}</span>`
    }
  )
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function syncOverrideScroll() {
  if (!overrideEditor.value || !overrideHighlight.value) {
    return
  }

  overrideHighlight.value.scrollTop = overrideEditor.value.scrollTop
  overrideHighlight.value.scrollLeft = overrideEditor.value.scrollLeft
}

function setPageScrollLocked(locked: boolean) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.style.overflow = locked ? 'hidden' : ''
  document.body.style.overflow = locked ? 'hidden' : ''
}

function matchesDraggedFile(event: DragEvent, target: 'skin' | 'override') {
  const items = Array.from(event.dataTransfer?.items ?? [])
  if (!items.length) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  return items.some((item) => {
    if (item.kind !== 'file') {
      return false
    }
    if (!item.type) {
      return true
    }
    if (target === 'skin') {
      return item.type === 'image/png'
    }
    return item.type === 'application/json' || item.type === 'text/json'
  })
}

function isAcceptedFile(file: File, target: 'skin' | 'override') {
  if (target === 'skin') {
    return /\.png$/i.test(file.name)
  }
  return /\.json$/i.test(file.name)
}
</script>

<template>
  <article class="panel rounded-3xl p-4">
    <div class="grid gap-2.5 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)_minmax(0,2fr)_4.5rem]">
      <section class="row-cell">
        <div class="flex min-w-0 items-center gap-2">
          <p class="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {{ t('component.row.item_id') }}
          </p>
          <span class="max-w-[45%] truncate whitespace-nowrap text-[11px] text-zinc-500">
            {{ t('component.row.item_id.desc') }}
          </span>
        </div>
        <label class="field-shell mt-3 flex items-center xl:h-[5.125rem]">
          <input
            :value="row.itemId"
            class="text-field font-mono text-[15px] tracking-[0.02em]"
            :placeholder="t('component.row.item_id.placeholder')"
            :disabled="busy"
            @input="emit('update:item-id', row.id, ($event.target as HTMLInputElement).value)"
          >
        </label>
      </section>

      <section
        class="row-cell relative"
        @dragenter.prevent="onSkinDragEnter"
        @dragover.prevent="onSkinDragOver"
        @dragleave="onSkinDragLeave"
        @drop="onSkinDrop"
      >
        <div
          v-if="skinDropActive"
          class="drop-overlay"
        >
          {{ t('component.row.skin_upload.drag') }}
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <p class="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {{ t('component.row.skin_upload') }}
          </p>
          <span class="max-w-[45%] truncate whitespace-nowrap text-[11px] text-zinc-500">
            {{ t('component.row.skin_upload.desc') }}
          </span>
        </div>
        <div class="field-shell mt-2.5 flex items-center gap-1.5 xl:h-[5.125rem]">
          <label class="block cursor-pointer">
            <input
              class="hidden"
              type="file"
              accept=".png,image/png"
              :disabled="busy"
              @change="onSkinChange"
            >
            <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <img
                v-if="row.skinPreviewUrl"
                :src="row.skinPreviewUrl"
                alt="Skin preview"
                class="h-full w-full object-cover"
              >
              <span v-else class="text-[11px] uppercase tracking-[0.24em] text-zinc-600">
                {{ t('component.row.skin_upload.preview_empty') }}
              </span>
            </div>
          </label>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <label
              v-if="!row.skinFileName"
              class="hint-click-button min-h-[2.25rem] cursor-pointer border border-zinc-800 bg-zinc-950/70 hover:border-emerald-400/50 hover:bg-zinc-900/90"
            >
              <span class="min-w-0 truncate text-sm text-zinc-100">
                {{ t('component.row.skin_upload.click_upload') }}
              </span>
              <span class="hint-click-action">
                {{ t('component.row.skin_upload.click_upload_action') }}
              </span>
              <input
                class="hidden"
                type="file"
                accept=".png,image/png"
                :disabled="busy"
                @change="onSkinChange"
              >
            </label>
            <p
              v-else
              class="flex items-center gap-1 px-0.5 text-sm text-zinc-100"
              :title="row.skinFileName || undefined"
            >
              <span class="min-w-0 flex-1 truncate">{{ row.skinFileName }}</span>
              <span class="shrink-0 text-zinc-500">{{ t('component.row.skin_upload.switch_inline') }}</span>
            </p>
            <button
              v-if="row.skinFileName"
              type="button"
              class="hint-click-button border border-zinc-800 bg-zinc-950/70 hover:border-emerald-400/50 hover:bg-zinc-900/90"
              :disabled="busy"
              @click="toggleSkinModel"
            >
              <span class="min-w-0 truncate text-sm text-zinc-100">
                {{ activeSkinTypeLabel }}
              </span>
              <span class="hint-click-action">
                {{ t('component.row.common.click_switch') }}
              </span>
            </button>
            <p v-else class="px-0.5 text-xs text-zinc-500">
              {{ t('component.row.skin_upload.drag_hint') }}
            </p>
          </div>
        </div>
      </section>

      <section class="row-cell relative">
        <div class="flex min-w-0 items-center gap-2">
          <p class="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {{ t('component.row.model_preset') }}
          </p>
          <span class="max-w-[45%] truncate whitespace-nowrap text-[11px] text-zinc-500">
            {{ t('component.row.model_preset.desc') }}
          </span>
        </div>
        <div class="field-shell mt-2.5 flex items-center xl:h-[5.125rem]">
          <button
            type="button"
            class="action-button h-full w-full flex-col gap-1 border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-center hover:border-sky-400/50 hover:bg-zinc-900/90"
            :disabled="busy"
            :title="activePresetLabel"
            @click="togglePresetBubble"
          >
            <span class="block w-full truncate text-sm text-zinc-100">
              {{ activePresetLabel }}
            </span>
            <span class="block text-[10px] leading-4 text-zinc-500">
              {{ t('component.row.common.click_choose') }}
            </span>
          </button>
        </div>

        <Teleport to="body">
          <div
            v-if="isPresetOpen"
            class="fixed inset-0 z-[9998] flex items-center justify-center bg-black/75 p-4"
            @click.self="closePresetBubble"
          >
            <div class="floating-bubble flex h-[80vh] w-[min(51.2rem,88vw)] flex-col">
              <div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <p class="text-sm font-medium text-white">{{ t('component.row.model_preset.dialog_title') }}</p>
                  <p class="mt-1 text-xs text-zinc-500">{{ t('component.row.model_preset.dialog_hint') }}</p>
                </div>
                <button type="button" class="action-button border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs hover:border-zinc-600" @click="closePresetBubble">
                  {{ t('component.common.close') }}
                </button>
              </div>
              <div class="flex-1 space-y-3 overflow-y-auto p-4">
                <button
                  v-for="preset in modelPresets"
                  :key="preset.id"
                  type="button"
                  class="flex w-full items-center justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition"
                  :class="row.modelTypeId === preset.id ? 'border-sky-400/60 bg-sky-400/10' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'"
                  @click="emit('update:model-type', row.id, preset.id); closePresetBubble()"
                >
                  <div class="min-w-0">
                    <p class="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">{{ preset.id }}</p>
                    <p class="mt-1 text-base font-medium text-zinc-100">{{ t(`model.type.${preset.id}`, preset.id) }}</p>
                    <p
                      v-if="t(`model.type.${preset.id}.desc`, '')"
                      class="mt-1 text-sm leading-6 text-zinc-400"
                    >
                      {{ t(`model.type.${preset.id}.desc`, '') }}
                    </p>
                  </div>
                  <div class="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                    <img
                      v-if="hasPreviewImage(preset.id)"
                      :src="preset.previewImage"
                      :alt="t(`model.type.${preset.id}`, preset.id)"
                      class="h-full w-full object-cover"
                      @error="markPreviewFailed(preset.id)"
                    >
                    <span v-else class="px-3 text-center text-[11px] leading-5 text-zinc-500">
                      {{ t('component.row.model_preset.preview_missing') }}
                    </span>
                  </div>
                </button>
                <p v-if="!modelPresets.length" class="rounded-3xl border border-zinc-800 bg-zinc-950/70 px-4 py-6 text-sm text-zinc-500">
                  {{ t('component.row.model_preset.dialog_empty') }}
                </p>
              </div>
            </div>
          </div>
        </Teleport>
      </section>

      <section
        class="row-cell relative"
        @dragenter.prevent="onOverrideDragEnter"
        @dragover.prevent="onOverrideDragOver"
        @dragleave="onOverrideDragLeave"
        @drop="onOverrideDrop"
      >
        <div
          v-if="overrideDropActive"
          class="drop-overlay"
        >
          {{ t('component.row.skin_upload.drag') }}
        </div>
        <div class="flex min-w-0 items-center gap-2">
          <p class="min-w-0 flex-1 truncate whitespace-nowrap text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
            {{ t('component.row.override') }}
          </p>
          <span class="max-w-[45%] truncate whitespace-nowrap text-[11px] text-zinc-500">
            {{ t('component.row.override.desc') }}
          </span>
        </div>
        <div class="field-shell mt-2.5 flex items-center xl:h-[5.125rem]">
          <div class="grid w-full grid-cols-2 gap-1.5">
            <button
              type="button"
              class="action-button whitespace-pre-line border border-zinc-800 bg-zinc-950/70 px-0.5 py-0.5 text-center text-[10px] leading-[0.9rem] hover:border-amber-400/60 hover:bg-zinc-900/90"
              :disabled="busy"
              @click="toggleOverrideBubble"
            >
              {{ t('component.row.override.edit') }}
            </button>
            <label class="action-button cursor-pointer whitespace-pre-line border border-zinc-800 bg-zinc-950/70 px-0.5 py-0.5 text-center text-[10px] leading-[0.9rem] hover:border-amber-400/60 hover:bg-zinc-900/90">
              {{ t('component.row.override.upload') }}
              <input
                class="hidden"
                type="file"
                accept=".json,application/json"
                :disabled="busy"
                @change="onOverrideChange"
              >
            </label>
          </div>
        </div>

        <Teleport to="body">
          <div
            v-if="isOverrideOpen"
            class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4"
            @click.self="closeOverrideBubble"
          >
            <div class="floating-bubble flex h-[85vh] w-[92vw] max-w-[1400px] flex-col">
              <div class="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
                <div>
                  <p class="text-sm font-medium text-white">{{ overrideDialogTitle }}</p>
                  <p class="mt-1 text-xs text-zinc-500">{{ overrideDialogDesc }}</p>
                </div>
                <div class="flex gap-2">
                  <button type="button" class="action-button border border-zinc-800 bg-zinc-950/70 px-3 py-1.5 text-xs hover:border-zinc-600" @click="closeOverrideBubble">
                    {{ t('component.common.close') }}
                  </button>
                  <button
                    type="button"
                    class="action-button border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100 hover:border-amber-300 hover:bg-amber-400/15 disabled:border-zinc-800 disabled:bg-zinc-950/70 disabled:text-zinc-500"
                    :disabled="busy || Boolean(overrideDraftError)"
                    @click="saveOverrideDraft"
                  >
                    {{ t('component.common.save') }}
                  </button>
                </div>
              </div>
              <div class="flex min-h-0 flex-1 flex-col gap-4 p-4">
                <div class="json-editor-shell min-h-0 flex-1 rounded-3xl border border-zinc-800 bg-zinc-950/80">
                  <pre
                    ref="overrideHighlight"
                    class="json-preview json-editor-layer h-full overflow-auto p-5 text-sm leading-7"
                    aria-hidden="true"
                    v-html="highlightedOverrideHtml"
                  />
                  <textarea
                    ref="overrideEditor"
                    class="json-editor-input h-full w-full p-5 text-sm leading-7 outline-none"
                    :value="overrideDraft"
                    :placeholder="t('component.row.override.placeholder')"
                    spellcheck="false"
                    @input="onOverrideInput"
                    @scroll="onOverrideScroll"
                  />
                </div>
                <p v-if="overrideDraftError" class="text-sm text-red-300">
                  {{ overrideDraftError }}
                </p>
              </div>
            </div>
          </div>
        </Teleport>
      </section>

      <section class="flex self-stretch">
        <button
          type="button"
          class="action-button h-full w-full border border-red-500/30 bg-red-500/10 text-red-200 hover:border-red-400/60 hover:bg-red-500/20 disabled:border-zinc-800 disabled:bg-zinc-900/60 disabled:text-zinc-600"
          :disabled="busy || !removable"
          @click="emit('remove', row.id)"
        >
          {{ t('component.row.remove') }}
        </button>
      </section>
    </div>

    <p v-if="row.lastValidationError" class="mt-3 text-sm text-red-300">
      {{ row.lastValidationError }}
    </p>
  </article>
</template>
