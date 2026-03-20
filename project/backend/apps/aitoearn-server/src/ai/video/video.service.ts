import path from 'node:path'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { AiLog, AiLogChannel, AiLogRepository, AiLogStatus, AiLogType, AiProviderSetting, AiProviderSettingRepository } from '@yikart/mongodb'
import dayjs from 'dayjs'
import _ from 'lodash'
import { DashscopeAction, KlingAction, TaskStatus } from '../../common/enums'
import { config } from '../../config'
import { LocalMediaService } from '../../file/storage/local-media.service'
import { PointsService } from '../../user/points.service'
import { UserService } from '../../user/user.service'
import { DashscopeService, TaskStatus as DashscopeTaskStatus, GetVideoTaskResponse } from '../libs/dashscope'
import {
  Image2VideoCreateTaskResponseData,
  KlingService,
  TaskStatus as KlingTaskStatus,
  Mode,
  MultiImage2VideoCreateTaskResponseData,
  Text2VideoCreateTaskResponseData,
  Text2VideoGetTaskResponseData,
} from '../libs/kling'
import {
  GetVideoGenerationTaskResponse as Sora2GetVideoGenerationTaskResponse,
  Sora2Service,
  TaskStatus as Sora2TaskStatus,
  VideoOrientation,
  VideoSize,
} from '../libs/sora2'
import {
  Content,
  ContentType,
  CreateVideoGenerationTaskResponse,
  GetVideoGenerationTaskResponse,
  ImageRole,
  parseModelTextCommand,
  serializeModelTextCommand,
  VolcengineService,
  TaskStatus as VolcTaskStatus,
} from '../libs/volcengine'
import { ModelsConfigService } from '../models-config'
import {
  DashscopeCallbackDto,
  KlingCallbackDto,
  Sora2CallbackDto,
  UserDashscopeImage2VideoRequestDto,
  UserDashscopeKeyFrame2VideoRequestDto,
  UserDashscopeText2VideoRequestDto,
  UserKlingImage2VideoRequestDto,
  UserKlingMultiImage2VideoRequestDto,
  UserKlingText2VideoRequestDto,
  UserListVideoTasksQueryDto,
  UserSora2GenerationRequestDto,
  UserVideoGenerationRequestDto,
  UserVideoTaskQueryDto,
  UserVolcengineGenerationRequestDto,
  VideoGenerationModelsQueryDto,
  VolcengineCallbackDto,
} from './video.dto'
import { ProviderClientFactory } from '../provider-settings/provider-client.factory'

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name)

  private shouldSkipBusinessGates(userType: UserType) {
    return userType === UserType.User
  }

  private async chargeUserPointsIfNeeded(userId: string, userType: UserType, pricing: number, description: string) {
    if (pricing <= 0 || userType !== UserType.User || this.shouldSkipBusinessGates(userType)) {
      return
    }

    const balance = await this.pointsService.getBalance(userId)
    if (balance < pricing) {
      throw new AppException(ResponseCode.UserPointsInsufficient)
    }

    await this.pointsService.deductPoints({
      userId,
      amount: pricing,
      type: 'ai_service',
      description,
    })
  }

  private async ensureUserCanAffordIfNeeded(userId: string, userType: UserType, pricing: number) {
    if (pricing <= 0 || userType !== UserType.User || this.shouldSkipBusinessGates(userType)) {
      return
    }

    const balance = await this.pointsService.getBalance(userId)
    if (balance < pricing) {
      throw new AppException(ResponseCode.UserPointsInsufficient)
    }
  }

  private async refundUserPointsIfNeeded(aiLog: AiLog) {
    if (aiLog.userType !== UserType.User || this.shouldSkipBusinessGates(aiLog.userType)) {
      return
    }

    await this.pointsService.addPoints({
      userId: aiLog.userId,
      amount: aiLog.points,
      type: 'ai_service',
      description: aiLog.model,
    })
  }

  constructor(
    private readonly userService: UserService,
    private readonly dashscopeService: DashscopeService,
    private readonly klingService: KlingService,
    private readonly volcengineService: VolcengineService,
    private readonly sora2Service: Sora2Service,
    private readonly aiLogRepo: AiLogRepository,
    private readonly mediaStorageService: LocalMediaService,
    private readonly modelsConfigService: ModelsConfigService,
    private readonly pointsService: PointsService,
    private readonly aiProviderSettingRepository: AiProviderSettingRepository,
  ) { }

  async calculateVideoGenerationPrice(params: {
    model: string
    userId?: string
    userType?: UserType
    resolution?: string
    aspectRatio?: string
    mode?: string
    duration?: number
  }): Promise<number> {
    const { model, userId, userType } = params

    // 查找对应的模型配置
    const modelConfig = (await this.getVideoGenerationModelParams({ userId, userType })).find(m => m.name === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const { resolution, aspectRatio, mode, duration } = {
      ...modelConfig.defaults,
      ...params,
    }

    const pricingConfig = modelConfig.pricing.find((pricing) => {
      const resolutionMatch = !pricing.resolution || !resolution || pricing.resolution === resolution
      const aspectRatioMatch = !pricing.aspectRatio || !aspectRatio || pricing.aspectRatio === aspectRatio
      const modeMatch = !pricing.mode || !mode || pricing.mode === mode
      const durationMatch = !pricing.duration || !duration || pricing.duration === duration

      return resolutionMatch && aspectRatioMatch && modeMatch && durationMatch
    })

    if (!pricingConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    this.logger.debug({
      params,
      modelConfig,
      pricingConfig,
    }, '模型价格计算')

    return pricingConfig.price
  }

  /**
   * 用户视频生成（通用接口）
   */
  async userVideoGeneration(request: UserVideoGenerationRequestDto) {
    const providerSetting = await ProviderClientFactory.resolveEnabledProvider(this.aiProviderSettingRepository, 'video', request.userId)
    if (providerSetting) {
      return await this.userVideoGenerationWithProvider(request, providerSetting)
    }

    const { model } = request

    // 查找模型配置以确定channel
    const modelConfig = this.modelsConfigService.config.video.generation.find(m => m.name === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }

    const channel = modelConfig.channel

    // 创建标准响应的辅助函数
    const createTaskResponse = (taskId: string) => ({
      task_id: taskId,
      status: TaskStatus.Submitted,
      message: '',
    })

    switch (channel) {
      case AiLogChannel.Kling:
        return this.handleKlingGeneration(request, createTaskResponse)
      case AiLogChannel.Volcengine:
        return this.handleVolcengineGeneration(request, createTaskResponse)
      case AiLogChannel.Dashscope:
        return this.handleDashscopeGeneration(request, createTaskResponse)
      case AiLogChannel.Sora2:
        return this.handleSora2Genration(request, createTaskResponse)
      default:
        throw new AppException(ResponseCode.InvalidModel)
    }
  }

  private async userVideoGenerationWithProvider(
    request: UserVideoGenerationRequestDto,
    providerSetting: AiProviderSetting,
  ) {
    const createTaskResponse = (taskId: string) => ({
      task_id: taskId,
      status: TaskStatus.Submitted,
      message: '',
    })

    switch (providerSetting.providerType) {
      case 'libtv':
        return await this.createDynamicVideoTask(request, providerSetting, AiLogChannel.NewApi, createTaskResponse)
      case 'openai-sora':
        return await this.createDynamicVideoTask(request, providerSetting, AiLogChannel.NewApi, createTaskResponse)
      case 'custom-video-api':
        return await this.createDynamicVideoTask(request, providerSetting, AiLogChannel.NewApi, createTaskResponse)
      case 'seedance-compatible':
        return await this.createDynamicVideoTask(request, providerSetting, AiLogChannel.NewApi, createTaskResponse)
      case 'kling':
        return await this.createDynamicVideoTask(request, providerSetting, AiLogChannel.NewApi, createTaskResponse)
      default:
        throw new AppException(ResponseCode.InvalidModel)
    }
  }

  private async createDynamicVideoTask<T>(
    request: UserVideoGenerationRequestDto,
    providerSetting: AiProviderSetting,
    channel: AiLogChannel,
    createTaskResponse: (taskId: string) => T,
  ) {
    const { userId, userType, image, prompt, image_tail, duration, size, mode } = request
    const resolvedModel = ProviderClientFactory.getResolvedModel(providerSetting, request.model)
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model: resolvedModel,
      duration,
      resolution: size,
      mode,
    }).catch(() => 0)
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.ensureUserCanAffordIfNeeded(userId, userType, billedPoints)

    const startedAt = new Date()
    const modeKey = Array.isArray(image) ? 'multi-image' : image ? 'image' : 'text'
    const url = ProviderClientFactory.getVideoCreateUrl(providerSetting, modeKey)
    const payload = ProviderClientFactory.buildVideoCreatePayload(providerSetting, {
      model: resolvedModel,
      prompt,
      image,
      image_tail,
      size,
      duration,
      mode,
      metadata: request.metadata,
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: ProviderClientFactory.getVideoHeaders(providerSetting),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(providerSetting.timeoutMs ?? 300000),
    })

    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new AppException(ResponseCode.AiCallFailed, body?.errorMessage ?? body?.message ?? `Video provider call failed: ${response.status}`)
    }

    const providerTaskId = ProviderClientFactory.extractTaskId(body)
    if (!providerTaskId) {
      throw new AppException(ResponseCode.AiCallFailed, 'Video provider did not return a task id')
    }

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: providerTaskId,
      model: resolvedModel,
      channel,
      action: providerSetting.providerType,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: {
        ...payload as Record<string, unknown>,
        providerType: providerSetting.providerType,
        providerMode: modeKey,
      },
      response: body,
      status: AiLogStatus.Generating,
    })

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, resolvedModel)

    return createTaskResponse(aiLog.id)
  }

  private getDynamicProviderMode(aiLog: AiLog): 'text' | 'image' | 'multi-image' {
    const providerMode = (aiLog.request as any)?.providerMode
    if (providerMode === 'image' || providerMode === 'multi-image') {
      return providerMode
    }
    return 'text'
  }

  private async pollDynamicVideoTask(aiLog: AiLog): Promise<AiLog> {
    if (aiLog.channel !== AiLogChannel.NewApi || aiLog.status !== AiLogStatus.Generating || !aiLog.taskId) {
      return aiLog
    }

    const providerSetting = await ProviderClientFactory.resolveEnabledProvider(this.aiProviderSettingRepository, 'video', aiLog.userId)
    if (!providerSetting) {
      return aiLog
    }

    const url = ProviderClientFactory.getVideoStatusUrl(providerSetting, aiLog.taskId, this.getDynamicProviderMode(aiLog))
    let responseBody: any = aiLog.response ?? {}

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: ProviderClientFactory.getVideoHeaders(providerSetting),
        signal: AbortSignal.timeout(providerSetting.timeoutMs ?? 300000),
      })

      responseBody = await response.json().catch(() => responseBody)
      if (!response.ok) {
        return aiLog
      }
    }
    catch {
      return aiLog
    }

    const genericStatus = ProviderClientFactory.mapGenericVideoTaskStatus(responseBody)
    if (!['success', 'failure'].includes(genericStatus)) {
      return aiLog
    }

    const mappedStatus = genericStatus === 'success' ? AiLogStatus.Success : AiLogStatus.Failed
    const normalizedResult = ProviderClientFactory.normalizeGenericVideoResult(responseBody)
    const updatedResponse = {
      ...responseBody,
      ...normalizedResult,
    }

    if (mappedStatus === AiLogStatus.Success && normalizedResult.data.video_url) {
      try {
        const filename = `${aiLog.id}.mp4`
        const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
        const result = await this.mediaStorageService.putObjectFromUrl(normalizedResult.data.video_url, fullPath)
        updatedResponse.data.video_url = result.path
      }
      catch (error) {
        this.logger.warn({ error, aiLogId: aiLog.id }, 'Failed to persist dynamic video result to S3')
      }
    }

    const updated = await this.aiLogRepo.updateById(aiLog.id, {
      status: mappedStatus,
      response: updatedResponse,
      duration: Date.now() - aiLog.startedAt.getTime(),
      errorMessage: mappedStatus === AiLogStatus.Failed
        ? responseBody?.errorMessage ?? responseBody?.message ?? responseBody?.error?.message ?? 'Dynamic video task failed'
        : undefined,
    })

    if (mappedStatus === AiLogStatus.Failed) {
      await this.refundUserPointsIfNeeded(aiLog)
    }
    if (!updated) {
      return aiLog
    }

    return updated
  }

  /**
   * 处理Kling渠道的视频生成
   */
  private async handleKlingGeneration<T>(
    request: UserVideoGenerationRequestDto,
    createTaskResponse: (taskId: string) => T,
  ) {
    const { userId, userType, model, prompt, mode, duration, image, image_tail } = request
    if (Array.isArray(image)) {
      throw new BadRequestException()
    }
    const klingMode = mode === 'std' ? Mode.Std : mode === 'pro' ? Mode.Pro : undefined
    const klingDuration = duration ? duration.toString() as '5' | '10' : undefined

    if (image) {
      const klingRequest: UserKlingImage2VideoRequestDto = {
        userId,
        userType,
        model_name: model,
        image,
        image_tail,
        prompt,
        mode: klingMode,
        duration: klingDuration,
      }
      const result = await this.klingImage2Video(klingRequest)
      return createTaskResponse(result.task_id)
    }
    else {
      const klingRequest: UserKlingText2VideoRequestDto = {
        userId,
        userType,
        model_name: model,
        prompt,
        mode: klingMode,
        duration: klingDuration,
      }
      const result = await this.klingText2Video(klingRequest)
      return createTaskResponse(result.task_id)
    }
  }

  /**
   * 处理Volcengine渠道的视频生成
   */
  private async handleVolcengineGeneration<T>(
    request: UserVideoGenerationRequestDto,
    createTaskResponse: (taskId: string) => T,
  ) {
    const { userId, userType, model, prompt, duration, size, image, image_tail } = request

    if (Array.isArray(image)) {
      throw new BadRequestException()
    }

    const textCommand = parseModelTextCommand(prompt)
    const content: Content[] = []

    // 添加图片内容
    if (image) {
      content.push({
        type: ContentType.ImageUrl,
        image_url: { url: image },
        role: ImageRole.FirstFrame,
      })
    }

    if (image_tail) {
      content.push({
        type: ContentType.ImageUrl,
        image_url: { url: image_tail },
        role: ImageRole.LastFrame,
      })
    }

    // 添加文本内容
    content.push({
      type: ContentType.Text,
      text: `${textCommand.prompt} ${serializeModelTextCommand({
        ...textCommand.params,
        duration,
        resolution: size,
      })}`,
    })

    const volcengineRequest: UserVolcengineGenerationRequestDto = {
      userId,
      userType,
      model,
      content,
    }
    const result = await this.volcengineCreate(volcengineRequest)
    return createTaskResponse(result.id)
  }

  /**
   * 处理Dashscope渠道的视频生成
   */
  private async handleDashscopeGeneration<T>(
    request: UserVideoGenerationRequestDto,
    createTaskResponse: (taskId: string) => T,
  ) {
    const { userId, userType, model, prompt, duration, size, image, image_tail } = request

    if (Array.isArray(image)) {
      throw new BadRequestException()
    }

    if (image && image_tail) {
      const dashscopeRequest: UserDashscopeKeyFrame2VideoRequestDto = {
        userId,
        userType,
        model,
        input: {
          first_frame_url: image,
          last_frame_url: image_tail,
          prompt,
        },
        parameters: {
          resolution: size,
          duration,
        },
      }
      const result = await this.dashscopeKeyFrame2Video(dashscopeRequest)
      return createTaskResponse(result.task_id)
    }
    else if (image && !image_tail) {
      const dashscopeRequest: UserDashscopeImage2VideoRequestDto = {
        userId,
        userType,
        model,
        input: {
          image_url: image,
          prompt,
        },
        parameters: {
          resolution: size,
        },
      }
      const result = await this.dashscopeImage2Video(dashscopeRequest)
      return createTaskResponse(result.task_id)
    }
    else {
      const dashscopeRequest: UserDashscopeText2VideoRequestDto = {
        userId,
        userType,
        model,
        input: {
          prompt,
        },
        parameters: {
          size,
          duration,
        },
      }
      const result = await this.dashscopeText2Video(dashscopeRequest)
      return createTaskResponse(result.task_id)
    }
  }

  /**
   * 解析 size 参数并计算宽高比和方向
   * @param size 格式: numberxnumber (如 1920x1080)
   * @returns { aspectRatio: '16:9' | '9:16', orientation: VideoOrientation }
   */
  private parseSizeToAspectRatio(size?: string): { aspectRatio: string, orientation: VideoOrientation } {
    const defaultResult = { aspectRatio: '9:16', orientation: VideoOrientation.Portrait }

    if (!size) {
      return defaultResult
    }

    const sizeMatch = size.match(/^(\d+)x(\d+)$/i)
    if (!sizeMatch) {
      return defaultResult
    }

    const width = Number(sizeMatch[1])
    const height = Number(sizeMatch[2])

    // 根据宽高比判断
    if (width > height) {
      return { aspectRatio: '16:9', orientation: VideoOrientation.Landscape }
    }
    else if (height > width) {
      return { aspectRatio: '9:16', orientation: VideoOrientation.Portrait }
    }
    else {
      return defaultResult
    }
  }

  /**
   *
   * 处理Sora2渠道的视频生成
   */
  private async handleSora2Genration<T>(
    request: UserVideoGenerationRequestDto,
    createTaskResponse: (taskId: string) => T,
  ) {
    const { userId, userType, model, prompt, duration, size, image, metadata } = request

    const isVeoModel = model.toLowerCase().startsWith('veo')

    const { aspectRatio, orientation } = this.parseSizeToAspectRatio(size)

    const sora2Request: UserSora2GenerationRequestDto = {
      userId,
      userType,
      model,
      prompt,
      duration,
      size: isVeoModel ? undefined : VideoSize.Large,
      images: image ? (Array.isArray(image) ? image : [image]) : undefined,
      orientation: metadata?.['orientation'] as VideoOrientation || orientation,
      enhance_prompt: isVeoModel ? true : undefined,
      aspect_ratio: isVeoModel ? aspectRatio : undefined,
    }
    const result = await this.sora2Create(sora2Request)
    return createTaskResponse(result.id)
  }

  /**
   * 从请求数据中提取 prompt
   */
  private extractPromptFromRequest(aiLog: AiLog): string | undefined {
    const request = aiLog.request as any
    if (!request) {
      return undefined
    }

    switch (aiLog.channel) {
      case AiLogChannel.Kling:
        return request.prompt
      case AiLogChannel.Volcengine:
        if (request.content && Array.isArray(request.content)) {
          const textContent = request.content.find((c: any) => c.type === ContentType.Text)
          if (textContent && 'text' in textContent) {
            // 使用 parseModelTextCommand 解析出纯 prompt
            const { prompt } = parseModelTextCommand(textContent.text)
            return prompt
          }
        }
        return undefined
      case AiLogChannel.Dashscope:
        return request.input?.prompt
      case AiLogChannel.Sora2:
        return request.prompt
      default:
        return undefined
    }
  }

  async transformToCommonResponse(aiLog: AiLog) {
    const prompt = this.extractPromptFromRequest(aiLog)

    if (aiLog.status === AiLogStatus.Generating) {
      return {
        task_id: aiLog.id,
        action: aiLog.action || '',
        status: TaskStatus.InProgress,
        fail_reason: '',
        submit_time: Math.floor(aiLog.startedAt.getTime() / 1000),
        start_time: Math.floor(aiLog.startedAt.getTime() / 1000),
        finish_time: 0,
        progress: '30%',
        prompt,
        data: {},
      }
    }

    if (!aiLog.response) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    const result = {
      task_id: aiLog.id,
      action: aiLog.action || '',
      status: aiLog.status === AiLogStatus.Success ? TaskStatus.Success : TaskStatus.Failure,
      fail_reason: '',
      submit_time: Math.floor(aiLog.startedAt.getTime() / 1000),
      start_time: Math.floor(aiLog.startedAt.getTime() / 1000),
      finish_time: Math.floor((aiLog.startedAt.getTime() + (aiLog.duration || 0)) / 1000),
      progress: '100%',
      prompt,
      data: {},
    }

    if (aiLog.channel === AiLogChannel.Kling) {
      return Object.assign(result, await this.getKlingTaskResult(aiLog.response as unknown as Text2VideoGetTaskResponseData))
    }
    else if (aiLog.channel === AiLogChannel.Volcengine) {
      return Object.assign(result, await this.getVolcengineTaskResult(aiLog.response as unknown as GetVideoGenerationTaskResponse))
    }
    else if (aiLog.channel === AiLogChannel.Dashscope) {
      return Object.assign(result, await this.getDashscopeTaskResult(aiLog.response as unknown as GetVideoTaskResponse))
    }
    else if (aiLog.channel === AiLogChannel.Sora2) {
      return Object.assign(result, await this.getSora2TaskResult(aiLog.response as unknown as Sora2GetVideoGenerationTaskResponse))
    }
    else {
      return Object.assign(result, ProviderClientFactory.normalizeGenericVideoResult(aiLog.response))
    }
  }

  /**
   * 查询视频任务状态
   */
  async getVideoTaskStatus(request: UserVideoTaskQueryDto) {
    const { taskId } = request

    const aiLogRecord = await this.aiLogRepo.getById(taskId)

    if (aiLogRecord == null || aiLogRecord.type !== AiLogType.Video) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    const refreshedLog = await this.pollDynamicVideoTask(aiLogRecord as AiLog)
    return this.transformToCommonResponse(refreshedLog)
  }

  async listVideoTasks(request: UserListVideoTasksQueryDto) {
    const [aiLogs, count] = await this.aiLogRepo.listWithPagination({
      ...request,
      type: AiLogType.Video,
    })

    return [await Promise.all(aiLogs.map(async (log) => {
      const refreshedLog = await this.pollDynamicVideoTask(log)
      return this.transformToCommonResponse(refreshedLog)
    })), count] as const
  }

  /**
   * 获取视频生成模型参数
   */
  async getVideoGenerationModelParams(data: VideoGenerationModelsQueryDto) {
    const models = _.cloneDeep(this.modelsConfigService.config.video.generation)

    if (data.userType === UserType.User && data.userId) {
      try {
        const providerSetting = await ProviderClientFactory.resolveEnabledProvider(
          this.aiProviderSettingRepository,
          'video',
          data.userId,
        )
        if (providerSetting?.model && !models.find(model => model.name === providerSetting.model)) {
          models.unshift({
            name: providerSetting.model,
            description: providerSetting.label || providerSetting.model,
            summary: 'User configured video model',
            tags: ['custom', 'user'],
            channel: AiLogChannel.NewApi,
            modes: providerSetting.providerType === 'kling'
              ? ['text2video', 'image2video', 'multi-image2video']
              : providerSetting.providerType === 'libtv'
                ? ['text2video', 'image2video']
              : ['text2video', 'image2video'],
            resolutions: ['720p'],
            durations: [5],
            supportedParameters: ['prompt', 'image', 'duration', 'size'],
            defaults: {
              resolution: '720p',
              duration: 5,
              mode: providerSetting.providerType === 'kling' ? 'std' : 'text',
            },
            pricing: [{ price: 0 }],
          })
        }

        // VIP 验证已移除：所有 freeForVip 模型始终免费
        models.forEach((model) => {
          if (model.freeForVip) {
            model.pricing.forEach((price) => {
              price.price = 0
            })
          }
        })
      }
      catch (error) {
        this.logger.warn({ error })
      }
    }

    return models
  }

  /**
   * Kling文生视频
   */
  /**
   * Dashscope文生视频
   */
  async dashscopeText2Video(request: UserDashscopeText2VideoRequestDto) {
    const { userId, userType, model, parameters, ...restParams } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model,
      duration: parameters?.duration,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model)

    const startedAt = new Date()
    const result = await this.dashscopeService.createTextToVideoTask({ model, parameters, ...restParams })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.output.task_id,
      model,
      channel: AiLogChannel.Dashscope,
      action: DashscopeAction.Text2Video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { model, parameters, ...restParams },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.output,
      task_id: aiLog.id,
    }
  }

  async klingText2Video(request: UserKlingText2VideoRequestDto) {
    const { userId, userType, model_name, duration, mode, ...params } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model: model_name,
      mode,
      duration: duration ? Number(duration) : undefined,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model_name)

    const startedAt = new Date()
    const result = await this.klingService.createText2VideoTask({
      ...params,
      model_name,
      mode,
      duration,
      callback_url: config.ai.kling.callbackUrl,
    })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.data.task_id,
      model: model_name,
      channel: AiLogChannel.Kling,
      action: KlingAction.Text2Video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { ...params, mode, duration, model_name },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.data,
      task_id: aiLog.id,
    } as Text2VideoCreateTaskResponseData
  }

  /**
   * Kling回调处理
   */
  async klingCallback(callbackData: KlingCallbackDto) {
    const { task_id, task_status, task_status_msg, task_result, updated_at } = callbackData

    const aiLog = await this.aiLogRepo.getByTaskId(task_id)
    if (!aiLog || aiLog.channel !== AiLogChannel.Kling) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (task_status !== KlingTaskStatus.Succeed && task_status !== KlingTaskStatus.Failed) {
      return
    }

    let status: AiLogStatus
    switch (task_status) {
      case KlingTaskStatus.Succeed:
        status = AiLogStatus.Success
        break
      case KlingTaskStatus.Failed:
        status = AiLogStatus.Failed
        break
      default:
        status = AiLogStatus.Generating
        break
    }

    const duration = updated_at - aiLog.startedAt.getTime()
    for (const video of task_result?.videos || []) {
      const filename = `${aiLog.id}-${video.id}.mp4`
      const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(video.url, fullPath)
      video.url = result.path
    }
    for (const image of task_result?.images || []) {
      const filename = `${aiLog.id}-${image.index}.png`
      const fullPath = path.join(`ai/image/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(image.url, fullPath)
      image.url = result.path
    }

    await this.aiLogRepo.updateById(aiLog.id, {
      status,
      response: callbackData,
      duration,
      errorMessage: task_status === 'failed' ? task_status_msg : undefined,
    })

    if (status === AiLogStatus.Failed) {
      await this.refundUserPointsIfNeeded(aiLog)
    }
  }

  /**
   * 查询Kling任务状态
   */
  async getKlingTaskResult(data: Text2VideoGetTaskResponseData) {
    const status = {
      [KlingTaskStatus.Succeed]: TaskStatus.Success,
      [KlingTaskStatus.Submitted]: TaskStatus.Submitted,
      [KlingTaskStatus.Processing]: TaskStatus.InProgress,
      [KlingTaskStatus.Failed]: TaskStatus.Failure,
    }[data.task_status]

    return {
      status,
      fail_reason: data.task_result.videos[0].url || data.task_status_msg || '',
      data: data.task_result || {},
    }
  }

  async getKlingTask(userId: string, userType: UserType, logId: string) {
    const aiLog = await this.aiLogRepo.getByIdAndUserId(logId, userId, userType)

    if (aiLog == null || !aiLog.taskId || aiLog.type !== AiLogType.Video || aiLog.channel !== AiLogChannel.Kling) {
      this.logger.debug({
        userId,
        userType,
        logId,
        aiLog,
      }, 'InvalidAiTaskId')
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }
    if (aiLog.status === AiLogStatus.Generating) {
      let result: KlingCallbackDto
      switch (aiLog.action) {
        case KlingAction.Image2video:
          result = (await this.klingService.getImage2VideoTask(aiLog.taskId)).data
          break
        case KlingAction.MultiImage2video:
          result = (await this.klingService.getMultiImage2VideoTask(aiLog.taskId)).data
          break
        case KlingAction.MultiElements:
          result = (await this.klingService.getMultiElementsTask(aiLog.taskId)).data
          break
        case KlingAction.VideoExtend:
          result = (await this.klingService.getVideoExtendTask(aiLog.taskId)).data
          break
        case KlingAction.LipSync:
          result = (await this.klingService.getLipSyncTask(aiLog.taskId)).data
          break
        case KlingAction.Effects:
          result = (await this.klingService.getVideoEffectsTask(aiLog.taskId)).data
          break
        case KlingAction.Text2Video:
        default:
          result = (await this.klingService.getText2VideoTask(aiLog.taskId)).data
      }

      if (result.task_status === KlingTaskStatus.Succeed || result.task_status === KlingTaskStatus.Failed) {
        await this.klingCallback(result)
      }
      return result
    }
    return aiLog.response as unknown as KlingCallbackDto
  }

  /**
   * Volcengine回调处理
   */
  async volcengineCallback(callbackData: VolcengineCallbackDto) {
    const { id, status, updated_at, content } = callbackData

    const aiLog = await this.aiLogRepo.getByTaskId(id)
    if (!aiLog || aiLog.channel !== AiLogChannel.Volcengine) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (status !== VolcTaskStatus.Succeeded && status !== VolcTaskStatus.Failed) {
      return
    }

    let aiLogStatus: AiLogStatus
    switch (status) {
      case VolcTaskStatus.Succeeded:
        aiLogStatus = AiLogStatus.Success
        break
      case VolcTaskStatus.Failed:
        aiLogStatus = AiLogStatus.Failed
        break
      default:
        aiLogStatus = AiLogStatus.Generating
        break
    }

    if (content) {
      if (content.last_frame_url) {
        const filename = `${aiLog.id}-last_frame_url.png`
        const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
        const result = await this.mediaStorageService.putObjectFromUrl(content.last_frame_url, fullPath)
        content.last_frame_url = result.path
      }

      const filename = `${aiLog.id}.mp4`
      const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(content.video_url, fullPath)
      content.video_url = result.path
    }

    const duration = (updated_at * 1000) - aiLog.startedAt.getTime()

    await this.aiLogRepo.updateById(aiLog.id, {
      status: aiLogStatus,
      response: callbackData,
      duration,
      errorMessage: status === 'failed' ? callbackData.error?.message : undefined,
    })

    if (aiLogStatus === AiLogStatus.Failed) {
      await this.refundUserPointsIfNeeded(aiLog)
    }
  }

  /**
   * Volcengine视频生成
   */
  async volcengineCreate(request: UserVolcengineGenerationRequestDto) {
    const { userId, userType, model, content, ...params } = request

    const textContent = content.find(c => c.type === ContentType.Text)
    const prompt = textContent && 'text' in textContent ? textContent.text : undefined

    if (!prompt) {
      throw new BadRequestException('prompt is required')
    }

    const { params: modelParams } = parseModelTextCommand(prompt)

    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      aspectRatio: modelParams.ratio,
      resolution: modelParams.resolution,
      duration: modelParams.duration,
      model,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model)

    const startedAt = new Date()
    const result = await this.volcengineService.createVideoGenerationTask({
      ...params,
      model,
      content,
      callback_url: config.ai.volcengine.callbackUrl,
    })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.id,
      model,
      channel: AiLogChannel.Volcengine,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: {
        ...params,
        model,
        content,
      },
      status: AiLogStatus.Generating,
    })

    return {
      ...result,
      id: aiLog.id,
    } as CreateVideoGenerationTaskResponse
  }

  /**
   * 查询Volcengine任务状态
   */
  async getVolcengineTaskResult(result: GetVideoGenerationTaskResponse) {
    const status = {
      [VolcTaskStatus.Succeeded]: TaskStatus.Success,
      [VolcTaskStatus.Queued]: TaskStatus.Submitted,
      [VolcTaskStatus.Running]: TaskStatus.InProgress,
      [VolcTaskStatus.Failed]: TaskStatus.Failure,
      [VolcTaskStatus.Cancelled]: TaskStatus.Failure,
    }[result.status]

    return {
      status,
      fail_reason: result.content?.video_url || result.error?.message || '',
      data: result.content || {},
    }
  }

  async getVolcengineTask(userId: string, userType: UserType, taskId: string) {
    const aiLog = await this.aiLogRepo.getByIdAndUserId(taskId, userId, userType)

    if (aiLog == null || !aiLog.taskId || aiLog.type !== AiLogType.Video || aiLog.channel !== AiLogChannel.Volcengine) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }
    if (aiLog.status === AiLogStatus.Generating) {
      const result = await this.volcengineService.getVideoGenerationTask(aiLog.taskId)
      if (result.status === VolcTaskStatus.Succeeded || result.status === VolcTaskStatus.Failed) {
        await this.volcengineCallback(result)
      }
      return result
    }
    return aiLog.response as unknown as GetVideoGenerationTaskResponse
  }

  /**
   * Kling图生视频
   */
  async klingImage2Video(request: UserKlingImage2VideoRequestDto) {
    const { userId, userType, model_name, duration, mode, ...params } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model: model_name,
      mode,
      duration: duration ? Number(duration) : undefined,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model_name)

    const startedAt = new Date()
    const result = await this.klingService.createImage2VideoTask({
      ...params,
      model_name,
      mode,
      duration,
      callback_url: config.ai.kling.callbackUrl,
    })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.data.task_id,
      model: model_name,
      channel: AiLogChannel.Kling,
      action: KlingAction.Image2video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { ...params, mode, duration, model_name },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.data,
      task_id: aiLog.id,
    } as Image2VideoCreateTaskResponseData
  }

  /**
   * Kling多图生视频
   */
  async klingMultiImage2Video(request: UserKlingMultiImage2VideoRequestDto) {
    const { userId, userType, model_name, duration, mode, ...params } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model: model_name,
      mode,
      duration: duration ? Number(duration) : undefined,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model_name)

    const startedAt = new Date()
    const result = await this.klingService.createMultiImage2VideoTask({
      ...params,
      model_name,
      mode,
      duration,
      callback_url: config.ai.kling.callbackUrl,
    })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.data.task_id,
      model: model_name,
      channel: AiLogChannel.Kling,
      action: KlingAction.MultiImage2video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { ...params, mode, duration, model_name },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.data,
      task_id: aiLog.id,
    } as MultiImage2VideoCreateTaskResponseData
  }

  /**
   * Dashscope图生视频
   */
  async dashscopeImage2Video(request: UserDashscopeImage2VideoRequestDto) {
    const { userId, userType, model, parameters, ...restParams } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model,
      resolution: parameters?.resolution,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model)

    const startedAt = new Date()
    const result = await this.dashscopeService.createImageToVideoTask({ model, parameters, ...restParams })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.output.task_id,
      model,
      channel: AiLogChannel.Dashscope,
      action: DashscopeAction.Image2Video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { model, parameters, ...restParams },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.output,
      task_id: aiLog.id,
    }
  }

  /**
   * Dashscope回调处理
   */
  async dashscopeCallback(callbackData: DashscopeCallbackDto) {
    const { output } = callbackData
    const { task_id, task_status, video_url, end_time } = output

    const aiLog = await this.aiLogRepo.getByTaskId(task_id)
    if (!aiLog || aiLog.channel !== AiLogChannel.Dashscope) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (task_status !== DashscopeTaskStatus.Succeeded && task_status !== DashscopeTaskStatus.Failed) {
      return
    }

    let status: AiLogStatus
    switch (task_status) {
      case DashscopeTaskStatus.Succeeded:
        status = AiLogStatus.Success
        break
      case DashscopeTaskStatus.Failed:
        status = AiLogStatus.Failed
        break
      default:
        status = AiLogStatus.Generating
        break
    }

    const duration = end_time ? new Date(end_time).getTime() - aiLog.startedAt.getTime() : undefined

    // 如果任务成功且有视频URL，保存到S3
    if (status === AiLogStatus.Success && video_url) {
      const filename = `${aiLog.id}.mp4`
      const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(video_url, fullPath)
      callbackData.output.video_url = result.path
    }

    await this.aiLogRepo.updateById(aiLog.id, {
      status,
      response: callbackData,
      duration,
      errorMessage: status === AiLogStatus.Failed ? callbackData.message : undefined,
    })

    if (status === AiLogStatus.Failed) {
      await this.refundUserPointsIfNeeded(aiLog)
    }
  }

  /**
   * Dashscope任务查询
   */
  async getDashscopeTask(userId: string, userType: UserType, taskId: string) {
    const aiLog = await this.aiLogRepo.getByIdAndUserId(taskId, userId, userType)

    if (aiLog == null || !aiLog.taskId || aiLog.type !== AiLogType.Video || aiLog.channel !== AiLogChannel.Dashscope) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }
    if (aiLog.status === AiLogStatus.Generating) {
      const result = await this.dashscopeService.getVideoTask(aiLog.taskId)
      if (result.output.task_status === DashscopeTaskStatus.Succeeded || result.output.task_status === DashscopeTaskStatus.Failed) {
        await this.dashscopeCallback(result)
      }
      return result
    }
    return aiLog.response as unknown as GetVideoTaskResponse
  }

  async getDashscopeTaskResult(result: GetVideoTaskResponse) {
    const { output } = result
    const { task_status } = output

    let status: TaskStatus
    switch (task_status) {
      case DashscopeTaskStatus.Succeeded:
        status = TaskStatus.Success
        break
      case DashscopeTaskStatus.Failed:
        status = TaskStatus.Failure
        break
      default:
        status = TaskStatus.InProgress
        break
    }

    return {
      fail_reason: status === TaskStatus.Failure ? result.message : '',
      data: output,
    }
  }

  /**
   * Dashscope首尾帧生视频
   */
  async dashscopeKeyFrame2Video(request: UserDashscopeKeyFrame2VideoRequestDto) {
    const { userId, userType, model, parameters, ...restParams } = request
    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model,
      resolution: parameters?.resolution,
      duration: parameters?.duration,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model)

    const startedAt = new Date()
    const result = await this.dashscopeService.createKeyFrameToVideoTask({ model, parameters, ...restParams })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.output.task_id,
      model,
      channel: AiLogChannel.Dashscope,
      action: DashscopeAction.KeyFrame2Video,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: { model, parameters, ...restParams },
      status: AiLogStatus.Generating,
    })

    return {
      ...result.output,
      task_id: aiLog.id,
    }
  }

  /**
   * Sora2视频生成
   */
  async sora2Create(request: UserSora2GenerationRequestDto) {
    const { userId, userType, model, prompt, ...params } = request

    const pricing = await this.calculateVideoGenerationPrice({
      userId,
      userType,
      model,
    })
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    await this.chargeUserPointsIfNeeded(userId, userType, billedPoints, model)

    const startedAt = new Date()
    const result = await this.sora2Service.createVideoGenerationTask({
      ...params,
      prompt,
      model,
    })

    const aiLog = await this.aiLogRepo.create({
      userId,
      userType,
      taskId: result.id,
      model,
      channel: AiLogChannel.Sora2,
      startedAt,
      type: AiLogType.Video,
      points: billedPoints,
      request: {
        ...params,
        model,
        prompt,
      },
      status: AiLogStatus.Generating,
    })

    return {
      ...result,
      id: aiLog.id,
    } as CreateVideoGenerationTaskResponse
  }

  /**
   * 查询Sora2任务状态
   */
  async getSora2TaskResult(result: Sora2GetVideoGenerationTaskResponse) {
    return {
      fail_reason: result?.video_url || result.finish_reason || result.error || '',
      data: result || {},
    }
  }

  async getSora2Task(userId: string, userType: UserType, taskId: string) {
    const aiLog = await this.aiLogRepo.getByIdAndUserId(taskId, userId, userType)

    if (aiLog == null || !aiLog.taskId || aiLog.type !== AiLogType.Video || aiLog.channel !== AiLogChannel.Sora2) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }
    if (aiLog.status === AiLogStatus.Generating) {
      const result = await this.sora2Service.getVideoGenerationTask(aiLog.taskId)
      if (result.status === Sora2TaskStatus.Completed || result.status === Sora2TaskStatus.Failed) {
        await this.sora2Callback(result)
      }
      return result
    }
    return aiLog.response as unknown as GetVideoGenerationTaskResponse
  }

  async sora2Callback(data: Sora2CallbackDto) {
    const { id, status } = data

    const aiLog = await this.aiLogRepo.getByTaskId(id)
    if (!aiLog || aiLog.channel !== AiLogChannel.Sora2) {
      throw new AppException(ResponseCode.InvalidAiTaskId)
    }

    if (status !== Sora2TaskStatus.Completed && status !== Sora2TaskStatus.Failed) {
      return
    }

    let aiLogStatus: AiLogStatus
    switch (status) {
      case Sora2TaskStatus.Completed:
        aiLogStatus = AiLogStatus.Success
        break
      case Sora2TaskStatus.Failed:
        aiLogStatus = AiLogStatus.Failed
        break
      default:
        aiLogStatus = AiLogStatus.Generating
        break
    }

    if (data.video_url) {
      const filename = `${aiLog.id}.mp4`
      const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(data.video_url, fullPath)
      data.video_url = result.path
    }

    if (data.thumbnail_url) {
      const filename = `${aiLog.id}-thumbnail.webp`
      const fullPath = path.join(`ai/video/${aiLog.model}`, aiLog.userId, filename)
      const result = await this.mediaStorageService.putObjectFromUrl(data.thumbnail_url, fullPath)
      data.thumbnail_url = result.path
    }

    const duration = Date.now() - aiLog.startedAt.getTime()

    await this.aiLogRepo.updateById(aiLog.id, {
      status: aiLogStatus,
      response: data,
      duration,
      errorMessage: status === Sora2TaskStatus.Failed ? data.finish_reason : undefined,
    })

    if (aiLogStatus === AiLogStatus.Failed) {
      await this.refundUserPointsIfNeeded(aiLog)
    }
  }
}
