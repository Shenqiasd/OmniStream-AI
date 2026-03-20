import path from 'node:path'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { QueueService } from '@yikart/aitoearn-queue'
import { AppException, getExtByMimeType, ImageType, ResponseCode, UserType } from '@yikart/common'
import { AiLogChannel, AiLogRepository, AiLogStatus, AiLogType, AiProviderSettingRepository } from '@yikart/mongodb'
import parseDataUri from 'data-urls'
import dayjs from 'dayjs'
import _ from 'lodash'
import OpenAI from 'openai'
import { config } from '../../config'
import { LocalMediaService } from '../../file/storage/local-media.service'
import { PointsService } from '../../user/points.service'
import { UserService } from '../../user/user.service'
import { FireflycardService } from '../libs/fireflycard'
import { Md2cardService } from '../libs/md2card'
import { OpenaiService } from '../libs/openai'
import { ModelsConfigService } from '../models-config'
import { ProviderClientFactory } from '../provider-settings/provider-client.factory'
import {
  FireflyCardDto,
  ImageEditDto,
  ImageEditModelsQueryDto,
  ImageGenerationDto,
  ImageGenerationModelsQueryDto,
  Md2CardDto,
  UserFireflyCardDto,
  UserImageEditDto,
  UserImageGenerationDto,
  UserMd2CardDto,
} from './image.dto'

type Uploadable = File | Response

@Injectable()
export class ImageService {
  private readonly logger = new Logger(ImageService.name)

  private shouldSkipBusinessGates(userType: UserType) {
    return userType === UserType.User
  }

  constructor(
    private readonly fireflyCardService: FireflycardService,
    private readonly mediaStorageService: LocalMediaService,
    private readonly openaiService: OpenaiService,
    private readonly md2cardService: Md2cardService,
    private readonly aiLogRepo: AiLogRepository,
    private readonly pointsService: PointsService,
    private readonly modelsConfigService: ModelsConfigService,
    private readonly queueService: QueueService,
    private readonly userService: UserService,
    private readonly aiProviderSettingRepository: AiProviderSettingRepository,
  ) { }

  /**
   * 将 data uri 转换为 Uploadable
   */
  private getUploadableByDataUri(dataUri: string, filename = 'image'): Uploadable {
    const file = parseDataUri(dataUri)
    if (file == null) {
      throw new BadRequestException('Invalid data URI')
    }
    const ext = getExtByMimeType(file.mimeType.essence as ImageType)

    return new File([file.body as BlobPart], `${filename}.${ext}`, { type: file.mimeType.essence })
  }

  /**
   * 将 URL 转换为 Uploadable
   */
  private async getUploadableByUrl(url: string): Promise<Uploadable> {
    return await fetch(url)
  }

  /**
   * 将 URL 或 Data URI 转换为 Uploadable
   */
  private async getUploadableByUrlOrDataUri(urlOrDataUri: string, filename = 'image'): Promise<Uploadable> {
    if (/^https?:\/\//.test(urlOrDataUri)) {
      return await this.getUploadableByUrl(urlOrDataUri)
    }
    return this.getUploadableByDataUri(urlOrDataUri, filename)
  }

  /**
   * 上传图片并返回路径
   */
  private async uploadImageAsset(imageUrlOrResponse: string | Response, basePath: string, user?: string): Promise<string> {
    if (typeof imageUrlOrResponse === 'string') {
      const filename = `${Date.now().toString(36)}-${path.basename(imageUrlOrResponse.split('?')[0])}`
      const fullPath = path.join(basePath, user || '', filename)
      const result = await this.mediaStorageService.putObjectFromUrl(imageUrlOrResponse, fullPath)
      return result.path
    }
    else {
      const contentType = imageUrlOrResponse.headers.get('content-type')!
      const ext = getExtByMimeType(contentType as ImageType)
      const filename = `${Date.now().toString(36)}.${ext}`
      const fullPath = path.join(basePath, user || '', filename)
      const result = await this.mediaStorageService.putObject(fullPath, imageUrlOrResponse.body!, contentType)
      return result.path
    }
  }

  /**
   * 图片生成
   */
  async generation(request: ImageGenerationDto) {
    const { user, ...params } = request
    const providerSetting = ProviderClientFactory.assertProviderType(
      await ProviderClientFactory.resolveEnabledProvider(this.aiProviderSettingRepository, 'image', user),
      'image',
      ['openai-compatible'],
    )
    const resolvedModel = ProviderClientFactory.getResolvedModel(providerSetting, params.model)

    if (resolvedModel === 'gpt-image-1') {
      delete params.response_format
      delete params.style
    }

    const result = await this.openaiService.createImageGeneration({
      ...params,
      model: resolvedModel,
      ...ProviderClientFactory.getOpenAIOverrides(providerSetting),
    } as Omit<OpenAI.Images.ImageGenerateParams, 'user'> & { apiKey?: string, baseUrl?: string, timeout?: number })

    for (const image of result.data || []) {
      if (image.url) {
        image.url = await this.uploadImageAsset(image.url, `ai/images/${resolvedModel}`, user)
      }
      if (image.b64_json) {
        const fullPath = path.join(`ai/images/${resolvedModel}`, user || '', `${Date.now().toString(36)}.${result.output_format || 'png'}`)
        const obj = await this.mediaStorageService.putObject(fullPath, Buffer.from(image.b64_json, 'base64'))
        image.url = obj.path
        delete image.b64_json
      }
    }

    return {
      ...result,
      list: result.data || [],
    }
  }

  /**
   * 图片编辑
   */
  async edit(request: ImageEditDto) {
    const { image, mask, user, ...params } = request
    const providerSetting = ProviderClientFactory.assertProviderType(
      await ProviderClientFactory.resolveEnabledProvider(this.aiProviderSettingRepository, 'image', user),
      'image',
      ['openai-compatible'],
    )
    const resolvedModel = ProviderClientFactory.getResolvedModel(providerSetting, params.model)

    let imageFile: Uploadable | Uploadable[]
    if (Array.isArray(image)) {
      imageFile = await Promise.all(image.map((img, index) =>
        this.getUploadableByUrlOrDataUri(img, `image-${index}`),
      ))
    }
    else {
      imageFile = await this.getUploadableByUrlOrDataUri(image, 'image')
    }

    const maskFile = mask ? await this.getUploadableByUrlOrDataUri(mask, 'mask') : undefined

    if (resolvedModel === 'gpt-image-1') {
      delete params.response_format
    }
    const imageResult = await this.openaiService.createImageEdit({
      ...params,
      model: resolvedModel,
      image: imageFile,
      mask: maskFile,
      size: params.size as 'auto',
      ...ProviderClientFactory.getOpenAIOverrides(providerSetting),
    } as Omit<OpenAI.Images.ImageEditParams, 'user' | 'stream'> & { apiKey?: string, baseUrl?: string, timeout?: number })

    for (const image of imageResult.data || []) {
      if (image.url) {
        image.url = await this.uploadImageAsset(image.url, `ai/images/${resolvedModel}`, user)
      }
      if (image.b64_json) {
        const fullPath = path.join(`ai/images/${resolvedModel}`, user || '', `${Date.now().toString(36)}.png`)
        const result = await this.mediaStorageService.putObject(fullPath, Buffer.from(image.b64_json, 'base64'))
        image.url = result.path
        delete image.b64_json
      }
    }

    return {
      created: imageResult.created,
      list: imageResult.data || [],
      usage: imageResult.usage,
    }
  }

  /**
   * MD2Card生成
   */
  async md2Card(request: Md2CardDto) {
    const result = await this.md2cardService.generateCard(request)

    for (const image of result.images) {
      image.url = await this.uploadImageAsset(image.url, 'ai/images/md2card')
    }

    return result
  }

  /**
   * Fireflycard生成
   */
  async fireflyCard(request: FireflyCardDto) {
    const reponse = await this.fireflyCardService.createImage(request)

    const imagePath = await this.uploadImageAsset(reponse, 'ai/images/md2card')
    return {
      image: imagePath,
    }
  }

  /**
   * 扣减用户积分
   */
  private async deductUserPoints(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.pointsService.deductPoints({
      userId,
      amount,
      type: 'ai_service',
      description,
      metadata,
    })
  }

  /**
   * 恢复用户积分
   */
  async addUserPoints(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.pointsService.addPoints({
      userId,
      amount,
      type: 'ai_service',
      description,
      metadata,
    })
  }

  /**
   * 获取图片模型价格
   */
  private async getImageModelPricing(model: string, kind: 'generation' | 'edit', userId?: string, userType?: UserType): Promise<number> {
    const list = kind === 'generation' ? await this.generationModelConfig({ userId, userType }) : await this.editModelConfig({ userId, userType })
    const modelConfig = list.find(m => m.name === model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel, 'model not found')
    }
    return Number(modelConfig.pricing)
  }

  /**
   * 统一的用户请求处理：校验余额、计费、扣费、日志
   */
  private async handleUserAiAction<T>(opts: {
    userId: string
    userType: UserType
    model: string
    channel?: AiLogChannel
    type: AiLogType
    pricing: number
    request: Record<string, unknown>
    run: () => Promise<T>
  }): Promise<T> {
    const { userId, userType, model, channel, type, pricing, request, run } = opts
    const startedAt = new Date()
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    const log = await this.aiLogRepo.create({
      userId,
      userType,
      model,
      channel: channel ?? AiLogChannel.NewApi,
      type,
      points: billedPoints,
      request,
      status: AiLogStatus.Generating,
      startedAt,
    })

    if (pricing > 0 && userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      const balance = await this.pointsService.getBalance(userId)
      if (balance < pricing) {
        throw new AppException(ResponseCode.UserPointsInsufficient)
      }
      await this.deductUserPoints(userId, pricing, model)
    }

    const result = await run().catch(async (e) => {
      if (billedPoints > 0 && userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
        await this.addUserPoints(userId, billedPoints, model)
      }
      const duration = Date.now() - startedAt.getTime()

      await this.aiLogRepo.updateById(log.id, {
        duration,
        status: AiLogStatus.Failed,
        errorMessage: e.message,
      })
      throw e
    })
    const duration = Date.now() - startedAt.getTime()

    await this.aiLogRepo.updateById(log.id, {
      duration,
      status: AiLogStatus.Success,
      response: result as Record<string, unknown>,
    })

    return result
  }

  /**
   * 用户图片生成
   */
  async userGeneration(request: UserImageGenerationDto) {
    const { userId, userType, ...params } = request

    const pricing = await this.getImageModelPricing(params.model, 'generation', userId, userType)

    return await this.handleUserAiAction({
      userId,
      userType,
      model: params.model,
      type: AiLogType.Image,
      pricing,
      request: params,
      run: () => this.generation({ ...params, user: userId }),
    })
  }

  /**
   * 用户图片编辑
   */
  async userEdit(request: UserImageEditDto) {
    const { userId, userType, ...params } = request

    const pricing = await this.getImageModelPricing(params.model, 'edit', userId, userType)

    return await this.handleUserAiAction({
      userId,
      userType,
      model: params.model,
      type: AiLogType.Image,
      pricing,
      request: params,
      run: () => this.edit({ ...params, user: userId }),
    })
  }

  async userMd2Card(request: UserMd2CardDto) {
    const { userId, userType, ...params } = request
    const pricing = 2

    return await this.handleUserAiAction({
      userId,
      userType,
      model: 'md2card',
      channel: AiLogChannel.Md2Card,
      type: AiLogType.Card,
      pricing,
      request: params,
      run: () => this.md2Card(params),
    })
  }

  async userFireFlyCard(request: UserFireflyCardDto) {
    const { userId, userType, ...params } = request

    return await this.handleUserAiAction({
      userId,
      userType,
      model: 'fireflyCard',
      channel: AiLogChannel.FireflyCard,
      type: AiLogType.Card,
      pricing: 0,
      request: params,
      run: () => this.fireflyCard(params),
    })
  }

  /**
   * 获取图片生成模型参数
   * @param data 查询参数，包含可选的 userId 和 userType，可用于后续个性化模型推荐
   */
  async generationModelConfig(data: ImageGenerationModelsQueryDto) {
    const models = _.cloneDeep(this.modelsConfigService.config.image.generation)

    if (data.userType === UserType.User && data.userId) {
      try {
        const providerSetting = await ProviderClientFactory.resolveEnabledProvider(
          this.aiProviderSettingRepository,
          'image',
          data.userId,
        )
        if (providerSetting?.model && !models.find(model => model.name === providerSetting.model)) {
          models.unshift({
            name: providerSetting.model,
            description: providerSetting.label || providerSetting.model,
            summary: 'User configured image model',
            tags: ['custom', 'user'],
            sizes: ['1024x1024'],
            qualities: ['standard'],
            styles: ['natural'],
            pricing: '0',
          })
        }

        // VIP 验证已移除：所有 freeForVip 模型始终免费
        models.forEach((model) => {
          if (model.freeForVip) {
            model.pricing = '0'
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
   * 获取图片编辑模型参数
   * @param data 查询参数，包含可选的 userId 和 userType，可用于后续个性化模型推荐
   */
  async editModelConfig(data: ImageEditModelsQueryDto) {
    const models = _.cloneDeep(this.modelsConfigService.config.image.edit)

    if (data.userType === UserType.User && data.userId) {
      try {
        const providerSetting = await ProviderClientFactory.resolveEnabledProvider(
          this.aiProviderSettingRepository,
          'image',
          data.userId,
        )
        if (providerSetting?.model && !models.find(model => model.name === providerSetting.model)) {
          models.unshift({
            name: providerSetting.model,
            description: providerSetting.label || providerSetting.model,
            summary: 'User configured image edit model',
            tags: ['custom', 'user'],
            sizes: ['1024x1024'],
            pricing: '0',
            maxInputImages: 4,
          })
        }

        // VIP 验证已移除：所有 freeForVip 模型始终免费
        models.forEach((model) => {
          if (model.freeForVip) {
            model.pricing = '0'
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
   * 异步图片生成
   */
  async userGenerationAsync(request: UserImageGenerationDto) {
    const { userId, userType, ...params } = request
    const pricing = await this.getImageModelPricing(params.model, 'generation', userId, userType)
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    // 创建 AiLog 记录
    const log = await this.aiLogRepo.create({
      userId,
      userType,
      model: params.model,
      channel: AiLogChannel.NewApi,
      type: AiLogType.Image,
      points: billedPoints,
      request: params,
      status: AiLogStatus.Generating,
      startedAt: new Date(),
    })

    // 扣除积分
    if (billedPoints > 0 && userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      const balance = await this.pointsService.getBalance(userId)
      if (balance < billedPoints) {
        await this.aiLogRepo.updateById(log.id, {
          status: AiLogStatus.Failed,
          errorMessage: '积分不足',
        })
        throw new AppException(ResponseCode.UserPointsInsufficient)
      }
      await this.deductUserPoints(userId, billedPoints, params.model)
    }

    // 添加队列任务
    await this.queueService.addAiImageAsyncJob({
      logId: log.id,
      userId,
      userType,
      model: params.model,
      channel: AiLogChannel.NewApi,
      type: AiLogType.Image,
      pricing: billedPoints,
      request: { ...params, user: userId },
      taskType: 'generation',
    })

    return {
      logId: log.id,
      status: AiLogStatus.Generating,
    }
  }

  /**
   * 异步图片编辑
   */
  async userEditAsync(request: UserImageEditDto) {
    const { userId, userType, ...params } = request
    const pricing = await this.getImageModelPricing(params.model, 'edit', userId, userType)
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    // 创建 AiLog 记录
    const log = await this.aiLogRepo.create({
      userId,
      userType,
      model: params.model,
      channel: AiLogChannel.NewApi,
      type: AiLogType.Image,
      points: billedPoints,
      request: params,
      status: AiLogStatus.Generating,
      startedAt: new Date(),
    })

    // 扣除积分
    if (billedPoints > 0 && userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      const balance = await this.pointsService.getBalance(userId)
      if (balance < billedPoints) {
        await this.aiLogRepo.updateById(log.id, {
          status: AiLogStatus.Failed,
          errorMessage: '积分不足',
        })
        throw new AppException(ResponseCode.UserPointsInsufficient)
      }
      await this.deductUserPoints(userId, billedPoints, params.model)
    }

    // 添加队列任务
    await this.queueService.addAiImageAsyncJob({
      logId: log.id,
      userId,
      userType,
      model: params.model,
      channel: AiLogChannel.NewApi,
      type: AiLogType.Image,
      pricing: billedPoints,
      request: { ...params, user: userId },
      taskType: 'edit',
    })

    return {
      logId: log.id,
      status: AiLogStatus.Generating,
    }
  }

  /**
   * 异步 MD2Card 生成
   */
  async userMd2CardAsync(request: UserMd2CardDto) {
    const { userId, userType, ...params } = request
    const pricing = 2
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : pricing

    // 创建 AiLog 记录
    const log = await this.aiLogRepo.create({
      userId,
      userType,
      model: 'md2card',
      channel: AiLogChannel.Md2Card,
      type: AiLogType.Card,
      points: billedPoints,
      request: params,
      status: AiLogStatus.Generating,
      startedAt: new Date(),
    })

    // 扣除积分
    if (billedPoints > 0 && userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      const balance = await this.pointsService.getBalance(userId)
      if (balance < billedPoints) {
        await this.aiLogRepo.updateById(log.id, {
          status: AiLogStatus.Failed,
          errorMessage: '积分不足',
        })
        throw new AppException(ResponseCode.UserPointsInsufficient)
      }
      await this.deductUserPoints(userId, billedPoints, 'md2card')
    }

    // 添加队列任务
    await this.queueService.addAiImageAsyncJob({
      logId: log.id,
      userId,
      userType,
      model: 'md2card',
      channel: AiLogChannel.Md2Card,
      type: AiLogType.Card,
      pricing: billedPoints,
      request: params,
      taskType: 'md2card',
    })

    return {
      logId: log.id,
      status: AiLogStatus.Generating,
    }
  }

  /**
   * 异步 FireflyCard 生成
   */
  async userFireFlyCardAsync(request: UserFireflyCardDto) {
    const { userId, userType, ...params } = request
    const pricing = 0

    // 创建 AiLog 记录
    const log = await this.aiLogRepo.create({
      userId,
      userType,
      model: 'fireflyCard',
      channel: AiLogChannel.FireflyCard,
      type: AiLogType.Card,
      points: pricing,
      request: params,
      status: AiLogStatus.Generating,
      startedAt: new Date(),
    })

    // 添加队列任务
    await this.queueService.addAiImageAsyncJob({
      logId: log.id,
      userId,
      userType,
      model: 'fireflyCard',
      channel: AiLogChannel.FireflyCard,
      type: AiLogType.Card,
      pricing,
      request: params,
      taskType: 'fireflyCard',
    })

    return {
      logId: log.id,
      status: AiLogStatus.Generating,
    }
  }

  /**
   * 查询任务状态
   */
  async getTaskStatus(logId: string) {
    const log = await this.aiLogRepo.getById(logId)
    if (!log) {
      throw new NotFoundException('任务不存在')
    }

    // 提取图片信息
    let images: Array<{ url?: string, b64_json?: string, revised_prompt?: string }> | undefined
    if (log.response) {
      // 处理不同的响应格式
      if (log.response['list'] && Array.isArray(log.response['list'])) {
        // 图片生成和编辑的响应格式
        images = log.response['list'] as Array<{ url?: string, b64_json?: string, revised_prompt?: string }>
      }
      else if (log.response['images'] && Array.isArray(log.response['images'])) {
        // MD2Card 的响应格式
        images = log.response['images'] as Array<{ url?: string, b64_json?: string, revised_prompt?: string }>
      }
      else if (log.response['image']) {
        // FireflyCard 的响应格式
        images = [{ url: log.response['image'] as string }]
      }
    }

    return {
      logId: log.id,
      status: log.status,
      startedAt: log.startedAt,
      duration: log.duration,
      points: log.points,
      request: log.request,
      response: log.response,
      images,
      errorMessage: log.errorMessage,
      createdAt: log.createdAt,
      updatedAt: log.updatedAt,
    }
  }
}
