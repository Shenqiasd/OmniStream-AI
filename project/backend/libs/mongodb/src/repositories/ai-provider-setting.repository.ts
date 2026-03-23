import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'
import { AiProviderSetting } from '../schemas'
import { BaseRepository } from './base.repository'

export const GLOBAL_PROVIDER_SETTING_USER_ID = null

export class AiProviderSettingRepository extends BaseRepository<AiProviderSetting> {
  constructor(
    @InjectModel(AiProviderSetting.name)
    aiProviderSettingModel: Model<AiProviderSetting>,
  ) {
    super(aiProviderSettingModel)
  }

  async listAll(userId?: string) {
    const filter: FilterQuery<AiProviderSetting> = userId
      ? { userId }
      : {}
    return await this.find(filter, { sort: { category: 1, providerKey: 1 } })
  }

  async getByProviderKey(providerKey: string, userId?: string) {
    if (userId) {
      const userSetting = await this.findOne({ providerKey, userId })
      if (userSetting) {
        return userSetting
      }
    }
    return await this.findOne(userId ? { providerKey, userId: null } : { providerKey })
  }

  async upsertByProviderKey(providerKey: string, data: Partial<AiProviderSetting>, userId?: string) {
    return await this.model.findOneAndUpdate(
      { providerKey, userId: userId ?? null },
      { $set: { ...data, userId: userId ?? null } },
      { upsert: true, new: true },
    ).exec()
  }

  async deleteByProviderKey(providerKey: string, userId?: string) {
    const result = await this.deleteOne({ providerKey, userId: userId ?? null })
    return result.deletedCount ?? 0
  }

  async listEnabledByCategory(category: string, userId?: string) {
    if (userId) {
      const userSettings = await this.find({
        category,
        enabled: true,
        userId,
      }, { sort: { updatedAt: -1 } })

      if (userSettings.length > 0) {
        return userSettings
      }
    }

    const filter: FilterQuery<AiProviderSetting> = {
      category,
      enabled: true,
      userId: GLOBAL_PROVIDER_SETTING_USER_ID,
    }
    return await this.find(filter, { sort: { updatedAt: -1 } })
  }

  async hasLocalModeEnabled(category: string, userId?: string) {
    if (userId) {
      const userSetting = await this.findOne({
        category,
        enabled: true,
        localMode: true,
        userId,
      })

      if (userSetting) {
        return true
      }
    }

    const globalSetting = await this.findOne({
      category,
      enabled: true,
      localMode: true,
      userId: GLOBAL_PROVIDER_SETTING_USER_ID,
    })

    return !!globalSetting
  }
}
