'use client'

import type { ProviderCategory, ProviderSetting, ProviderType } from '@/api/ai'
import { create } from 'zustand'
import {
  deleteProviderSetting,
  getChatModels,
  getImageGenerationModels,
  getProviderSettings,
  getVideoGenerationModels,

  putUserAiConfigItem,
  testProviderConnection,
  upsertProviderSetting,
} from '@/api/ai'
import { useUserStore } from '@/store/user'

export interface ModelOption {
  name: string
  description?: string
}

export interface ProviderPreset {
  id: string
  name: string
  category: ProviderCategory
  providerType: ProviderType
  defaultBaseUrl: string
  icon: string
  description?: string
  models?: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    category: 'text',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '🤖',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-5.1-all', 'o3-mini'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    category: 'text',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    icon: '🐋',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'qwen',
    name: 'Qwen / DashScope',
    category: 'text',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    icon: '☁️',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
  },
  {
    id: 'moonshot',
    name: 'Moonshot / Kimi',
    category: 'text',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    icon: '🌙',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
  },
  {
    id: 'zhipu',
    name: 'Zhipu / GLM',
    category: 'text',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    icon: '🧠',
    models: ['glm-4-plus', 'glm-4', 'glm-4-flash'],
  },
  {
    id: 'openai-image',
    name: 'OpenAI (DALL-E)',
    category: 'image',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '🎨',
    models: ['dall-e-3', 'gpt-image-1'],
  },
  {
    id: 'gemini-image',
    name: 'Google Gemini Image',
    category: 'image',
    providerType: 'openai-compatible',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    icon: '💎',
    models: ['gemini-2.5-flash-image'],
  },
  {
    id: 'sora',
    name: 'OpenAI Sora',
    category: 'video',
    providerType: 'openai-sora',
    defaultBaseUrl: 'https://api.openai.com/v1',
    icon: '🎬',
    models: ['sora-2'],
  },
  {
    id: 'kling',
    name: 'Kling',
    category: 'video',
    providerType: 'kling',
    defaultBaseUrl: 'https://api.klingai.com',
    icon: '🎥',
    models: ['kling-v1', 'kling-v1-5'],
  },
  {
    id: 'seedance',
    name: 'Seedance (Volcengine)',
    category: 'video',
    providerType: 'seedance-compatible',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com',
    icon: '🌱',
    models: ['seedance-1-0-pro'],
  },
]

export interface ProviderFormState extends ProviderSetting {
  apiKeyMasked?: string
}

interface AiConfigState {
  loading: boolean
  providers: Record<string, ProviderFormState>
  modelOptions: Record<ProviderCategory, ModelOption[]>
  savingKey: string | null
  testingKey: string | null

  // Actions
  loadAll: () => Promise<void>
  updateProvider: (providerKey: string, patch: Partial<ProviderFormState>) => void
  saveProvider: (providerKey: string) => Promise<boolean>
  testConnection: (providerKey: string) => Promise<{ success: boolean, message?: string }>
  addProviderFromPreset: (preset: ProviderPreset) => void
  removeProvider: (providerKey: string) => Promise<boolean>
  syncDefaultModel: (type: 'agent' | 'image' | 'video', model: string) => Promise<void>
  getEnabledProviders: (category: ProviderCategory) => ProviderFormState[]
  getDefaultModel: (category: ProviderCategory) => string
}

function createEmptyProvider(
  providerKey: string,
  category: ProviderCategory,
  providerType: ProviderType = 'openai-compatible',
): ProviderFormState {
  return {
    providerKey,
    providerType,
    category,
    label: `${category}-provider`,
    enabled: false,
    localMode: true,
    baseUrl: '',
    apiKey: '',
    apiKeyMasked: '',
    hasApiKey: false,
    model: '',
    headers: {},
    extraConfig: {},
  }
}

export const useAiConfigStore = create<AiConfigState>((set, get) => ({
  loading: true,
  providers: {},
  modelOptions: { text: [], image: [], video: [] },
  savingKey: null,
  testingKey: null,

  loadAll: async () => {
    set({ loading: true })
    try {
      const [settingsRes, chatRes, imageRes, videoRes] = await Promise.allSettled([
        getProviderSettings(),
        getChatModels(),
        getImageGenerationModels(),
        getVideoGenerationModels(),
      ])

      const providers: Record<string, ProviderFormState> = {}

      // Load existing provider settings from server
      const settings = (settingsRes.status === 'fulfilled' ? settingsRes.value?.data || [] : []) as ProviderSetting[]
      for (const setting of settings) {
        providers[setting.providerKey] = {
          ...setting,
          apiKey: '',
          apiKeyMasked: setting.apiKey,
        }
      }

      // Ensure default providers exist for each category
      const defaultKeys: Record<ProviderCategory, string> = {
        text: 'text-default',
        image: 'image-default',
        video: 'video-default',
      }
      for (const [category, key] of Object.entries(defaultKeys)) {
        if (!providers[key]) {
          providers[key] = createEmptyProvider(key, category as ProviderCategory)
        }
      }

      const extractModels = (result: PromiseSettledResult<any>) =>
        (result.status === 'fulfilled' ? (result.value?.data || []) as any[] : [])
          .map((item: any) => ({ name: item.name, description: item.description }))

      set({
        providers,
        modelOptions: {
          text: extractModels(chatRes),
          image: extractModels(imageRes),
          video: extractModels(videoRes),
        },
      })
    }
    finally {
      set({ loading: false })
    }
  },

  updateProvider: (providerKey, patch) => {
    set(state => ({
      providers: {
        ...state.providers,
        [providerKey]: {
          ...state.providers[providerKey],
          ...patch,
        },
      },
    }))
  },

  saveProvider: async (providerKey) => {
    const provider = get().providers[providerKey]
    if (!provider)
      return false

    set({ savingKey: providerKey })
    try {
      const res = await upsertProviderSetting(providerKey, {
        ...provider,
        label: provider.label || `${provider.category}-provider`,
      })

      if (res?.code === 0 && res.data) {
        set(state => ({
          providers: {
            ...state.providers,
            [providerKey]: {
              ...state.providers[providerKey],
              ...res.data,
              apiKey: '',
              apiKeyMasked: res.data!.apiKey,
            },
          },
        }))
        return true
      }
      return false
    }
    finally {
      set({ savingKey: null })
    }
  },

  testConnection: async (providerKey) => {
    const provider = get().providers[providerKey]
    if (!provider)
      return { success: false, message: 'Provider not found' }

    set({ testingKey: providerKey })
    try {
      const res = await testProviderConnection({
        providerKey: provider.providerKey,
        providerType: provider.providerType,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        timeoutMs: provider.timeoutMs,
        headers: provider.headers,
      })

      return {
        success: !!res?.data?.success,
        message: res?.data?.errorMessage,
      }
    }
    finally {
      set({ testingKey: null })
    }
  },

  addProviderFromPreset: (preset) => {
    const key = `${preset.category}-${preset.id}-${Date.now()}`
    const provider = createEmptyProvider(key, preset.category, preset.providerType)
    provider.label = preset.name
    provider.baseUrl = preset.defaultBaseUrl
    provider.model = preset.models?.[0] || ''
    provider.enabled = true

    set(state => ({
      providers: {
        ...state.providers,
        [key]: provider,
      },
    }))
  },

  removeProvider: async (providerKey) => {
    // Don't allow removing default providers
    if (['text-default', 'image-default', 'video-default'].includes(providerKey))
      return false

    // Check if this provider has been saved to server (has hasApiKey or baseUrl set from server)
    const provider = get().providers[providerKey]
    if (provider?.hasApiKey || provider?.apiKeyMasked) {
      try {
        await deleteProviderSetting(providerKey)
      }
      catch {
        return false
      }
    }

    set((state) => {
      const { [providerKey]: _, ...rest } = state.providers
      return { providers: rest }
    })
    return true
  },

  syncDefaultModel: async (type, model) => {
    try {
      await putUserAiConfigItem({
        type,
        value: { defaultModel: model },
      })
      // Refresh user info to pick up changes
      useUserStore.getState().getUserInfo()
    }
    catch {
      // silent fail
    }
  },

  getEnabledProviders: (category) => {
    return Object.values(get().providers).filter(
      p => p.category === category && p.enabled,
    )
  },

  getDefaultModel: (category) => {
    const userInfo = useUserStore.getState().userInfo
    const typeMap: Record<ProviderCategory, string | undefined> = {
      text: userInfo?.aiInfo?.agent?.defaultModel,
      image: userInfo?.aiInfo?.image?.defaultModel,
      video: userInfo?.aiInfo?.video?.defaultModel,
    }
    const serverDefault = typeMap[category]
    if (serverDefault)
      return serverDefault

    // Fallback to first enabled provider's model
    const enabled = get().getEnabledProviders(category)
    if (enabled.length > 0 && enabled[0].model)
      return enabled[0].model

    // Hardcoded fallbacks
    const fallbacks: Record<ProviderCategory, string> = {
      text: 'gpt-5.1-all',
      image: 'gemini-2.5-flash-image',
      video: 'sora-2',
    }
    return fallbacks[category]
  },
}))
