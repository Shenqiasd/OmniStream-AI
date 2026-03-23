import { AppException, ResponseCode } from '@yikart/common'
import { AiProviderSetting, AiProviderSettingRepository, AiProviderType } from '@yikart/mongodb'

export type ProviderCategory = 'text' | 'image' | 'video'

export class ProviderClientFactory {
  static async resolveEnabledProvider(
    repository: AiProviderSettingRepository,
    category: ProviderCategory,
    userId?: string,
  ): Promise<AiProviderSetting | null> {
    const settings = await repository.listEnabledByCategory(category, userId)
    return settings[0] ?? null
  }

  static requireEnabledProvider(
    setting: AiProviderSetting | null,
    category: ProviderCategory,
  ): AiProviderSetting {
    if (setting == null) {
      throw new AppException(ResponseCode.InvalidModel, `No enabled ${category} provider configured`)
    }

    return setting
  }

  static assertProviderType(
    setting: AiProviderSetting | null,
    category: ProviderCategory,
    allowedTypes: AiProviderType[],
  ): AiProviderSetting | null {
    if (setting == null) {
      return null
    }

    if (!allowedTypes.includes(setting.providerType)) {
      throw new AppException(
        ResponseCode.InvalidModel,
        `Provider type "${setting.providerType}" is not supported for ${category}; allowed types: ${allowedTypes.join(', ')}`,
      )
    }

    return setting
  }

  static getResolvedModel(setting: AiProviderSetting | null, requestedModel?: string) {
    return requestedModel || setting?.model || ''
  }

  static getOpenAIOverrides(setting: AiProviderSetting | null) {
    if (setting == null) {
      return {}
    }

    return {
      apiKey: setting.apiKey,
      baseUrl: setting.baseUrl,
      timeout: setting.timeoutMs,
    }
  }

  static getVideoCreateUrl(setting: AiProviderSetting, mode: 'text' | 'image' | 'multi-image' = 'text') {
    const normalizedBaseUrl = setting.baseUrl.replace(/\/$/, '')
    const customPath = typeof setting.extraConfig?.['createPath'] === 'string'
      ? setting.extraConfig['createPath']
      : undefined

    if (customPath) {
      return `${normalizedBaseUrl}${customPath.startsWith('/') ? '' : '/'}${customPath}`
    }

    switch (setting.providerType) {
      case 'libtv':
        return `${normalizedBaseUrl}/openapi/session`
      case 'openai-sora':
        return `${normalizedBaseUrl}/videos`
      case 'kling':
        return `${normalizedBaseUrl}${mode === 'image' || mode === 'multi-image' ? '/v1/videos/image2video' : '/v1/videos/text2video'}`
      case 'seedance-compatible':
        return `${normalizedBaseUrl}/video/generations`
      case 'custom-video-api':
      default:
        return normalizedBaseUrl
    }
  }

  static getVideoStatusUrl(setting: AiProviderSetting, taskId: string, mode: 'text' | 'image' | 'multi-image' = 'text') {
    const normalizedBaseUrl = setting.baseUrl.replace(/\/$/, '')
    const customPath = typeof setting.extraConfig?.['statusPath'] === 'string'
      ? setting.extraConfig['statusPath']
      : undefined

    if (customPath) {
      const resolvedPath = customPath.includes('{taskId}')
        ? customPath.split('{taskId}').join(taskId)
        : `${customPath}${customPath.endsWith('/') ? '' : '/'}${taskId}`
      return `${normalizedBaseUrl}${resolvedPath.startsWith('/') ? '' : '/'}${resolvedPath}`
    }

    switch (setting.providerType) {
      case 'libtv':
        return `${normalizedBaseUrl}/openapi/session/${taskId}`
      case 'openai-sora':
        return `${normalizedBaseUrl}/videos/${taskId}`
      case 'kling':
        if (mode === 'multi-image') {
          return `${normalizedBaseUrl}/v1/videos/multi-image2video/${taskId}`
        }
        return `${normalizedBaseUrl}${mode === 'image' ? '/v1/videos/image2video' : '/v1/videos/text2video'}/${taskId}`
      case 'seedance-compatible':
        return `${normalizedBaseUrl}/video/generations/${taskId}`
      case 'custom-video-api':
      default:
        return `${normalizedBaseUrl}/${taskId}`
    }
  }

  static extractTaskId(payload: any): string | null {
    return payload?.task_id
      || payload?.id
      || payload?.taskId
      || payload?.sessionId
      || payload?.data?.task_id
      || payload?.data?.id
      || payload?.data?.sessionId
      || payload?.output?.task_id
      || null
  }

  static getVideoHeaders(setting: AiProviderSetting) {
    return {
      'Content-Type': 'application/json',
      ...(setting.headers ?? {}),
      ...(setting.apiKey ? { Authorization: `Bearer ${setting.apiKey}` } : {}),
    }
  }

  static buildVideoCreatePayload(
    setting: AiProviderSetting,
    params: {
      model: string
      prompt?: string
      image?: string | string[]
      image_tail?: string
      size?: string
      duration?: number
      mode?: string
      metadata?: Record<string, unknown>
    },
  ) {
    const basePayload = {
      model: params.model,
      model_name: params.model,
      prompt: params.prompt,
      image: params.image,
      image_tail: params.image_tail,
      size: params.size,
      duration: params.duration,
      mode: params.mode,
      callback_url: setting.callbackUrl,
      callbackUrl: setting.callbackUrl,
      metadata: params.metadata,
    }

    switch (setting.providerType) {
      case 'libtv': {
        const lines = [(params.prompt || '').trim()]
        if (params.duration) {
          lines.push(`时长：${params.duration}秒`)
        }
        if (params.metadata?.['aspectRatio']) {
          lines.push(`画幅比例：${params.metadata['aspectRatio']}`)
        }
        if (Array.isArray(params.image)) {
          params.image.forEach((image, index) => lines.push(`参考图${index + 1}：${image}`))
        }
        else if (params.image) {
          lines.push(`参考图：${params.image}`)
        }
        if (params.image_tail) {
          lines.push(`尾帧图：${params.image_tail}`)
        }
        return {
          message: lines.filter(Boolean).join('\n'),
        }
      }
      case 'openai-sora':
        return {
          model: params.model,
          prompt: params.prompt,
          image: params.image,
          size: params.size,
          duration: params.duration,
          metadata: params.metadata,
        }
      case 'kling':
        if (Array.isArray(params.image)) {
          return {
            model_name: params.model,
            image_list: params.image.map(image => ({ image })),
            prompt: params.prompt,
            mode: params.mode,
            duration: params.duration ? String(params.duration) : undefined,
            callback_url: setting.callbackUrl,
          }
        }
        return {
          model_name: params.model,
          prompt: params.prompt,
          image: params.image,
          image_tail: params.image_tail,
          mode: params.mode,
          duration: params.duration ? String(params.duration) : undefined,
          callback_url: setting.callbackUrl,
        }
      case 'seedance-compatible':
      case 'custom-video-api':
      default:
        return basePayload
    }
  }

  static normalizeGenericVideoResult(payload: any) {
    const libtvVideoUrl = this.extractLibtvVideoUrl(payload)
    const videoUrl = payload?.video_url
      || payload?.url
      || payload?.data?.video_url
      || payload?.data?.url
      || payload?.output?.video_url
      || payload?.output?.url
      || payload?.result?.video_url
      || payload?.result?.url
      || libtvVideoUrl

    const coverUrl = payload?.cover_url
      || payload?.coverUrl
      || payload?.data?.cover_url
      || payload?.data?.coverUrl
      || payload?.output?.cover_url
      || payload?.output?.coverUrl

    return {
      data: videoUrl
        ? {
            video_url: videoUrl,
            cover_url: coverUrl || '',
          }
        : {},
    }
  }

  static getGenericVideoTaskState(payload: any) {
    return payload?.task_status
      || payload?.status
      || payload?.state
      || payload?.data?.task_status
      || payload?.data?.status
      || payload?.output?.task_status
      || payload?.output?.status
      || payload?.result?.task_status
      || payload?.result?.status
      || ''
  }

  static mapGenericVideoTaskStatus(payload: any): 'submitted' | 'processing' | 'success' | 'failure' | 'unknown' {
    const libtvVideoUrl = this.extractLibtvVideoUrl(payload)
    if (libtvVideoUrl) {
      return 'success'
    }

    const rawState = String(this.getGenericVideoTaskState(payload) || '').trim().toLowerCase()

    if (!rawState) {
      const hasVideo = Boolean(this.normalizeGenericVideoResult(payload).data.video_url)
      if (hasVideo) {
        return 'success'
      }
      if (Array.isArray(payload?.messages) || Array.isArray(payload?.data?.messages)) {
        return 'processing'
      }
      return 'unknown'
    }

    if (['submitted', 'queued', 'pending', 'created', 'not_start'].includes(rawState)) {
      return 'submitted'
    }

    if (['processing', 'running', 'inprogress', 'in_progress', 'progressing'].includes(rawState)) {
      return 'processing'
    }

    if (['succeed', 'succeeded', 'success', 'completed', 'done'].includes(rawState)) {
      return 'success'
    }

    if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'rejected'].includes(rawState)) {
      return 'failure'
    }

    return 'unknown'
  }

  private static extractLibtvVideoUrl(payload: any): string | undefined {
    const messages = payload?.messages
    if (!Array.isArray(messages)) {
      return undefined
    }

    const toolMessages = [...messages].reverse().filter(message => message?.role === 'tool')
    for (const message of toolMessages) {
      const content = message?.content
      if (typeof content !== 'string' || !content) {
        continue
      }

      try {
        const parsed = JSON.parse(content) as {
          task_result?: { videos?: Array<{ previewPath?: string, url?: string }> }
        }
        const first = parsed.task_result?.videos?.find(video => video.previewPath || video.url)
        if (first) {
          return first.previewPath || first.url
        }
      }
      catch {
      }
    }

    const assistantMessages = [...messages].reverse().filter(message => message?.role === 'assistant')
    const pattern = /https:\/\/libtv-res\.liblib\.art\/[^\s"'<>]+\.(?:mp4|mov|webm)/g
    for (const message of assistantMessages) {
      const content = typeof message?.content === 'string' ? message.content : ''
      const match = content.match(pattern)
      if (match?.[0]) {
        return match[0]
      }
    }

    return undefined
  }
}
