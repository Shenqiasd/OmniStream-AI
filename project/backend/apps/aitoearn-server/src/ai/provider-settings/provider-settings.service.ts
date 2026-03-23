import { Injectable } from '@nestjs/common'
import { AiProviderSettingRepository } from '@yikart/mongodb'
import { DeleteProviderSettingDto, TestProviderConnectionDto, UpsertProviderSettingDto } from './dto/provider-settings.dto'

@Injectable()
export class ProviderSettingsService {
  constructor(
    private readonly aiProviderSettingRepository: AiProviderSettingRepository,
  ) {}

  async list(userId: string) {
    const settings = await this.aiProviderSettingRepository.listAll(userId)
    return settings.map(setting => this.sanitize(setting))
  }

  async get(providerKey: string, userId: string) {
    const setting = await this.aiProviderSettingRepository.getByProviderKey(providerKey, userId)
    return setting ? this.sanitize(setting) : null
  }

  async upsert(userId: string, data: UpsertProviderSettingDto) {
    const previous = await this.aiProviderSettingRepository.getByProviderKey(data.providerKey, userId)
    const nextApiKey = data.apiKey?.trim()
    const setting = await this.aiProviderSettingRepository.upsertByProviderKey(data.providerKey, {
      ...data,
      apiKey: nextApiKey || previous?.apiKey || '',
      headers: data.headers ?? {},
      extraConfig: data.extraConfig ?? {},
    }, userId)
    return this.sanitize(setting)
  }

  async remove(userId: string, data: DeleteProviderSettingDto) {
    return await this.aiProviderSettingRepository.deleteByProviderKey(data.providerKey, userId)
  }

  async testConnection(userId: string, data: TestProviderConnectionDto) {
    const previous = data.providerKey
      ? await this.aiProviderSettingRepository.getByProviderKey(data.providerKey, userId)
      : null
    const baseHeaders = data.headers ?? previous?.headers ?? {}
    const timeoutMs = data.timeoutMs ?? previous?.timeoutMs ?? 5000
    const apiKey = data.apiKey?.trim() || previous?.apiKey || ''
    const providerType = data.providerType || previous?.providerType
    const baseUrl = data.baseUrl || previous?.baseUrl

    if (!providerType || !baseUrl) {
      return {
        success: false,
        status: 0,
        url: '',
        errorMessage: 'Missing providerType or baseUrl',
      }
    }

    const url = this.resolveTestUrl(providerType, baseUrl)

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...baseHeaders,
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        signal: AbortSignal.timeout(timeoutMs),
      })

      return {
        success: response.ok || (providerType === 'libtv' && response.status === 404),
        status: response.status,
        url,
      }
    }
    catch (error: any) {
      return {
        success: false,
        status: 0,
        url,
        errorMessage: error?.message ?? 'Connection test failed',
      }
    }
  }

  private resolveTestUrl(providerType: string, baseUrl: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '')

    switch (providerType) {
      case 'openai-compatible':
      case 'openai-sora':
        return `${normalizedBaseUrl}/models`
      case 'libtv':
        return `${normalizedBaseUrl}/openapi/session/__codex_health_check__`
      default:
        return normalizedBaseUrl
    }
  }

  private sanitize(setting: any) {
    const rawSetting = typeof setting?.toJSON === 'function'
      ? setting.toJSON()
      : setting

    return {
      ...rawSetting,
      apiKey: this.maskApiKey(rawSetting?.apiKey ?? ''),
      hasApiKey: !!rawSetting?.apiKey,
    }
  }

  private maskApiKey(apiKey: string) {
    if (!apiKey) {
      return ''
    }

    if (apiKey.length <= 8) {
      return '*'.repeat(apiKey.length)
    }

    return `${apiKey.slice(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.slice(-4)}`
  }
}
