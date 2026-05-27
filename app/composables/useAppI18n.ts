export type AppLocale = 'zh_cn' | 'en_us' | 'zh_hk'

type LocaleMessages = Record<string, string>

const SUPPORTED_LOCALES: AppLocale[] = ['zh_cn', 'en_us', 'zh_hk']
const LOCALE_LABELS: Record<AppLocale, string> = {
  zh_cn: '简体中文',
  en_us: 'English',
  zh_hk: '繁體中文'
}

export function useAppI18n() {
  const currentLocale = useState<AppLocale>('app-locale', () => 'zh_cn')
  const messages = useState<LocaleMessages>('app-locale-messages', () => ({}))
  const initialized = useState<boolean>('app-locale-initialized', () => false)

  const localeOptions = computed(() => {
    return SUPPORTED_LOCALES.map((locale) => ({
      code: locale,
      label: LOCALE_LABELS[locale]
    }))
  })

  const t = (key: string, fallback?: string) => {
    return messages.value[key] ?? fallback ?? key
  }

  const detectLocale = (): AppLocale => {
    if (typeof window === 'undefined') {
      return 'zh_cn'
    }

    const persisted = window.localStorage.getItem('app-locale')
    if (persisted && SUPPORTED_LOCALES.includes(persisted as AppLocale)) {
      return persisted as AppLocale
    }

    const language = window.navigator.language.toLowerCase()
    if (language.includes('zh-hk') || language.includes('zh-tw') || language.includes('hant')) {
      return 'zh_hk'
    }
    if (language.includes('en')) {
      return 'en_us'
    }
    return 'zh_cn'
  }

  const loadLocale = async (locale: AppLocale) => {
    const response = await fetch(`/locales/${locale}.json`)
    if (!response.ok) {
      throw new Error(`无法读取语言文件：${locale}.json`)
    }

    messages.value = await response.json() as LocaleMessages
    currentLocale.value = locale
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('app-locale', locale)
    }
  }

  const initI18n = async () => {
    if (initialized.value) {
      return
    }

    await loadLocale(detectLocale())
    initialized.value = true
  }

  return {
    currentLocale,
    localeOptions,
    initI18n,
    loadLocale,
    t
  }
}
