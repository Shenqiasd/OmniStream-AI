import { BaseMessage, ChatMessage } from '@langchain/core/messages'
import { OpenAIClient } from '@langchain/openai'
import { Injectable, Logger } from '@nestjs/common'
import { AppException, ResponseCode, UserType } from '@yikart/common'
import { AiLogChannel, AiLogRepository, AiLogStatus, AiLogType, AiProviderSettingRepository } from '@yikart/mongodb'
import { BigNumber } from 'bignumber.js'
import dayjs from 'dayjs'
import _ from 'lodash'
import { config } from '../../config'
import { PointsService } from '../../user/points.service'
import { UserService } from '../../user/user.service'
import { OpenaiService } from '../libs/openai'
import { ModelsConfigService } from '../models-config'
import { ProviderClientFactory } from '../provider-settings/provider-client.factory'
import { ChatCompletionDto, ChatModelsQueryDto, UserChatCompletionDto } from './chat.dto'

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  private shouldSkipBusinessGates(userType: UserType) {
    return userType === UserType.User
  }

  constructor(
    private readonly userService: UserService,
    private readonly openaiService: OpenaiService,
    private readonly pointsService: PointsService,
    private readonly aiLogRepo: AiLogRepository,
    private readonly modelsConfigService: ModelsConfigService,
    private readonly aiProviderSettingRepository: AiProviderSettingRepository,
  ) {}

  async chatCompletion(request: ChatCompletionDto & { userId?: string }) {
    const { messages, model, userId, ...params } = request
    const providerSetting = ProviderClientFactory.assertProviderType(
      await ProviderClientFactory.resolveEnabledProvider(this.aiProviderSettingRepository, 'text', userId),
      'text',
      ['openai-compatible'],
    )

    const langchainMessages: BaseMessage[] = messages.map((message) => {
      return new ChatMessage(message)
    })

    const result = await this.openaiService.createChatCompletion({
      model: ProviderClientFactory.getResolvedModel(providerSetting, model),
      messages: langchainMessages,
      ...params,
      ...ProviderClientFactory.getOpenAIOverrides(providerSetting),
      modalities: params.modalities as OpenAIClient.Chat.ChatCompletionModality[],
    })

    const usage = result.usage_metadata
    if (!usage) {
      throw new AppException(ResponseCode.AiCallFailed, { error: 'Missing usage metadata' })
    }

    return {
      model: ProviderClientFactory.getResolvedModel(providerSetting, model),
      usage,
      ...result,
    }
  }

  /**
   * 扣减用户积分
   * @param userId 用户ID
   * @param amount 扣减积分数量
   * @param description 积分变动描述
   * @param metadata 额外信息
   */
  async deductUserPoints(
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

  async userChatCompletion({ userId, userType, ...params }: UserChatCompletionDto) {
    const modelConfig = (await this.getChatModelConfig({ userId, userType })).find((m: { name: string }) => m.name === params.model)
    if (!modelConfig) {
      throw new AppException(ResponseCode.InvalidModel)
    }
    const pricing = modelConfig.pricing
    if (userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      const balance = await this.pointsService.getBalance(userId)
      if (balance < 0) {
        throw new AppException(ResponseCode.UserPointsInsufficient)
      }
      if ('price' in pricing) {
        const price = Number(pricing.price)
        if (balance < price) {
          throw new AppException(ResponseCode.UserPointsInsufficient)
        }
      }
    }

    const startedAt = new Date()

    const result = await this.chatCompletion({ ...params, userId })

    const duration = Date.now() - startedAt.getTime()

    const { usage } = result

    let points = 0
    if ('price' in pricing) {
      points = Number(pricing.price)
    }
    else {
      const prompt = new BigNumber(usage.input_tokens).div('1000').times(pricing.prompt)
      const completion = new BigNumber(usage.output_tokens).div('1000').times(pricing.completion)
      points = prompt.plus(completion).toNumber()
    }
    const billedPoints = this.shouldSkipBusinessGates(userType) ? 0 : points

    this.logger.debug({
      points,
      billedPoints,
      usage,
      modelConfig,
    })

    if (userType === UserType.User && !this.shouldSkipBusinessGates(userType)) {
      await this.deductUserPoints(
        userId,
        billedPoints,
        modelConfig.name,
        usage,
      )
    }

    await this.aiLogRepo.create({
      userId,
      userType,
      model: params.model,
      channel: AiLogChannel.NewApi,
      startedAt,
      duration,
      type: AiLogType.Chat,
      points: billedPoints,
      request: params,
      response: result,
      status: AiLogStatus.Success,
    })

    return {
      ...result,
      usage: {
        ...usage,
        points: billedPoints,
      },
    }
  }

  /**
   * 获取聊天模型参数
   * @param data 查询参数，包含可选的 userId 和 userType，可用于后续个性化模型推荐
   */
  async getChatModelConfig(data: ChatModelsQueryDto) {
    const baseModels = _.cloneDeep(this.modelsConfigService.config.chat)

    if (data.userType === UserType.User && data.userId) {
      try {
        const providerSetting = await ProviderClientFactory.resolveEnabledProvider(
          this.aiProviderSettingRepository,
          'text',
          data.userId,
        )
        if (providerSetting?.model && !baseModels.find(model => model.name === providerSetting.model)) {
          baseModels.unshift({
            name: providerSetting.model,
            description: providerSetting.label || providerSetting.model,
            summary: 'User configured text model',
            tags: ['custom', 'user'],
            inputModalities: ['text'],
            outputModalities: ['text'],
            pricing: { price: '0' },
          })
        }

        // VIP 验证已移除：所有 freeForVip 模型始终免费
        baseModels.forEach((model) => {
          if (model.freeForVip) {
            model.pricing = { price: '0' }
          }
        })
      }
      catch (error) {
        this.logger.warn({ error })
      }
    }

    return baseModels
  }
}
