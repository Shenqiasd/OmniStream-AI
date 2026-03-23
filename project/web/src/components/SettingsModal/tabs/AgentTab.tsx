'use client'

import type { ProviderCategory, ProviderType } from '@/api/ai'
import type { ProviderFormState, ProviderPreset } from '@/store/aiConfig'
import { ChevronDown, ChevronUp, Loader2, Plus, Settings2, Trash2, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTransClient } from '@/app/i18n/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  PROVIDER_PRESETS,

  useAiConfigStore,
} from '@/store/aiConfig'

const PROVIDER_TYPE_OPTIONS: Record<ProviderCategory, Array<{ value: ProviderType, label: string }>> = {
  text: [
    { value: 'openai-compatible', label: 'OpenAI Compatible' },
  ],
  image: [
    { value: 'openai-compatible', label: 'OpenAI Compatible' },
  ],
  video: [
    { value: 'libtv', label: 'LibTV' },
    { value: 'openai-sora', label: 'OpenAI Sora' },
    { value: 'seedance-compatible', label: 'Seedance Compatible' },
    { value: 'kling', label: 'Kling' },
    { value: 'custom-video-api', label: 'Custom Video API' },
  ],
}

function ProviderCard({
  provider,
  onUpdate,
  onSave,
  onTest,
  onRemove,
  isSaving,
  isTesting,
  modelOptions,
  isDefault,
  t,
}: {
  provider: ProviderFormState
  onUpdate: (patch: Partial<ProviderFormState>) => void
  onSave: () => void
  onTest: () => void
  onRemove?: () => void
  isSaving: boolean
  isTesting: boolean
  modelOptions: Array<{ name: string, description?: string }>
  isDefault: boolean
  t: (key: string) => string
}) {
  const [expanded, setExpanded] = useState(!provider.hasApiKey && !provider.baseUrl)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const preset = PROVIDER_PRESETS.find(
    p => provider.label === p.name || provider.providerKey.includes(p.id),
  )

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      provider.enabled ? 'border-primary/30 bg-primary/[0.02]' : 'border-border',
    )}
    >
      {/* Card header */}
      <div
        className="flex cursor-pointer items-center justify-between px-4 py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{preset?.icon || '⚡'}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {provider.label || provider.providerKey}
              </span>
              {provider.enabled && (
                <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {t('agent.active')}
                </span>
              )}
              {provider.localMode && provider.enabled && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {t('agent.localMode')}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {provider.model || t('agent.notConfigured')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={provider.enabled}
            onCheckedChange={(checked) => {
              onUpdate({ enabled: checked })
            }}
            onClick={e => e.stopPropagation()}
          />
          {expanded
            ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded form */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Provider Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('agent.providerType')}</label>
              <Select
                value={provider.providerType}
                onValueChange={value => onUpdate({ providerType: value as ProviderType })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPE_OPTIONS[provider.category].map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('agent.model')}</label>
              <Input
                className="h-9"
                value={provider.model}
                onChange={e => onUpdate({ model: e.target.value })}
                placeholder={t('agent.modelPlaceholder')}
              />
            </div>

            {/* Base URL */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">{t('agent.baseUrl')}</label>
              <Input
                className="h-9"
                value={provider.baseUrl}
                onChange={e => onUpdate({ baseUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>

            {/* API Key */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">{t('agent.apiKey')}</label>
              <Input
                className="h-9"
                type="password"
                value={provider.apiKey}
                onChange={e => onUpdate({ apiKey: e.target.value })}
                placeholder={provider.apiKeyMasked || t('agent.apiKeyPlaceholder')}
              />
              {provider.apiKeyMasked && !provider.apiKey && (
                <p className="text-xs text-muted-foreground">
                  {t('agent.apiKeySaved')}
                  {' '}
                  {provider.apiKeyMasked}
                </p>
              )}
            </div>

            {/* Local Mode toggle */}
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 md:col-span-2">
              <div>
                <div className="text-xs font-medium text-foreground">{t('agent.localMode')}</div>
                <div className="text-[11px] text-muted-foreground">{t('agent.localModeDesc')}</div>
              </div>
              <Switch
                checked={provider.localMode}
                onCheckedChange={checked => onUpdate({ localMode: checked })}
              />
            </div>

            {/* Recommended models */}
            {modelOptions.length > 0 && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{t('agent.recommendedModels')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {modelOptions.slice(0, 10).map(option => (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => onUpdate({ model: option.name })}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        provider.model === option.name
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {option.description || option.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preset model chips (from preset) */}
            {preset?.models && preset.models.length > 0 && (
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-muted-foreground">{t('agent.presetModels')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {preset.models.map(model => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => onUpdate({ model })}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                        provider.model === model
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Advanced config toggle */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="h-3 w-3" />
                {t('agent.advancedConfig')}
                {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showAdvanced && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('agent.callbackUrl')}</label>
                  <Input
                    className="h-9"
                    value={provider.callbackUrl || ''}
                    onChange={e => onUpdate({ callbackUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{t('agent.timeout')}</label>
                  <Input
                    className="h-9"
                    type="number"
                    value={provider.timeoutMs || ''}
                    onChange={e => onUpdate({ timeoutMs: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="30000"
                  />
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {isSaving ? t('agent.saving') : t('agent.save')}
            </Button>
            <Button size="sm" variant="outline" onClick={onTest} disabled={isTesting}>
              {isTesting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Zap className="mr-1.5 h-3.5 w-3.5" />
              {t('agent.testConnection')}
            </Button>
            {!isDefault && onRemove && (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t('agent.remove')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PresetPicker({
  category,
  onSelect,
  t,
}: {
  category: ProviderCategory
  onSelect: (preset: ProviderPreset) => void
  t: (key: string) => string
}) {
  const [open, setOpen] = useState(false)
  const presets = PROVIDER_PRESETS.filter(p => p.category === category)

  if (presets.length === 0)
    return null

  return (
    <div className="relative">
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(!open)}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        {t('agent.addProvider')}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {presets.map(preset => (
              <button
                key={preset.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(preset)
                  setOpen(false)
                }}
              >
                <span className="text-base">{preset.icon}</span>
                <div>
                  <div className="font-medium text-foreground">{preset.name}</div>
                  {preset.models && (
                    <div className="text-[11px] text-muted-foreground">
                      {preset.models.slice(0, 2).join(', ')}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function AgentTab() {
  const { t } = useTransClient('settings')
  const {
    loading,
    providers,
    modelOptions,
    savingKey,
    testingKey,
    loadAll,
    updateProvider,
    saveProvider,
    testConnection,
    addProviderFromPreset,
    removeProvider,
    syncDefaultModel,
  } = useAiConfigStore()

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleSave = useCallback(async (providerKey: string) => {
    const provider = providers[providerKey]
    if (!provider?.baseUrl || !provider?.model) {
      toast.error(t('agent.requiredFields'))
      return
    }

    const success = await saveProvider(providerKey)
    if (success) {
      toast.success(t('agent.saveSuccess'))

      // Auto-sync default model to server for the category
      const typeMap: Record<ProviderCategory, 'agent' | 'image' | 'video'> = {
        text: 'agent',
        image: 'image',
        video: 'video',
      }
      if (provider.enabled && provider.model) {
        syncDefaultModel(typeMap[provider.category], provider.model)
      }
    }
    else {
      toast.error(t('agent.saveFailed'))
    }
  }, [providers, saveProvider, syncDefaultModel, t])

  const handleTest = useCallback(async (providerKey: string) => {
    const provider = providers[providerKey]
    if (!provider?.baseUrl) {
      toast.error(t('agent.requiredFields'))
      return
    }

    const result = await testConnection(providerKey)
    if (result.success) {
      toast.success(t('agent.testSuccess'))
    }
    else {
      toast.error(result.message || t('agent.testFailed'))
    }
  }, [providers, testConnection, t])

  const handleAddPreset = useCallback((preset: ProviderPreset) => {
    addProviderFromPreset(preset)
    toast.success(t('agent.providerAdded'))
  }, [addProviderFromPreset, t])

  const handleRemove = useCallback(async (providerKey: string) => {
    const success = await removeProvider(providerKey)
    if (success) {
      toast.success(t('agent.providerRemoved'))
    }
    else {
      toast.error(t('agent.removeFailed'))
    }
  }, [removeProvider, t])

  const categoryMeta = useMemo(() => [
    {
      key: 'text' as ProviderCategory,
      title: t('agent.textTitle'),
      description: t('agent.textDesc'),
    },
    {
      key: 'image' as ProviderCategory,
      title: t('agent.imageTitle'),
      description: t('agent.imageDesc'),
    },
    {
      key: 'video' as ProviderCategory,
      title: t('agent.videoTitle'),
      description: t('agent.videoDesc'),
    },
  ], [t])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <h3 className="text-sm font-semibold text-foreground">{t('agent.panelTitle')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('agent.panelDesc')}</p>
      </div>

      {/* Category sections */}
      {categoryMeta.map(({ key: category, title, description }) => {
        const categoryProviders = Object.entries(providers)
          .filter(([_, p]) => p.category === category)
          .sort(([a], [b]) => {
            // Default providers first
            const aDefault = a.endsWith('-default') ? 0 : 1
            const bDefault = b.endsWith('-default') ? 0 : 1
            return aDefault - bDefault
          })

        return (
          <section key={category}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-foreground">{title}</h4>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <PresetPicker
                category={category}
                onSelect={handleAddPreset}
                t={k => t(k)}
              />
            </div>

            <div className="space-y-2">
              {categoryProviders.map(([key, provider]) => (
                <ProviderCard
                  key={key}
                  provider={provider}
                  onUpdate={patch => updateProvider(key, patch)}
                  onSave={() => handleSave(key)}
                  onTest={() => handleTest(key)}
                  onRemove={key.endsWith('-default') ? undefined : () => handleRemove(key)}
                  isSaving={savingKey === key}
                  isTesting={testingKey === key}
                  modelOptions={modelOptions[category]}
                  isDefault={key.endsWith('-default')}
                  t={k => t(k)}
                />
              ))}

              {categoryProviders.length === 0 && (
                <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                  <p className="text-sm text-muted-foreground">{t('agent.noProviders')}</p>
                </div>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
