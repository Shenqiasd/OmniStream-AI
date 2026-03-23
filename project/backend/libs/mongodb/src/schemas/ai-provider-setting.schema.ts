import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { WithTimestampSchema } from './timestamp.schema'

export const AI_PROVIDER_TYPES = [
  'openai-compatible',
  'openai-sora',
  'kling',
  'seedance-compatible',
  'custom-video-api',
  'libtv',
] as const

export const AI_PROVIDER_CATEGORIES = [
  'text',
  'image',
  'video',
] as const

export type AiProviderType = typeof AI_PROVIDER_TYPES[number]
export type AiProviderCategory = typeof AI_PROVIDER_CATEGORIES[number]

@Schema({
  collection: 'aiProviderSetting',
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  timestamps: true,
})
export class AiProviderSetting extends WithTimestampSchema {
  id: string

  @Prop({ required: false, index: true })
  userId?: string

  @Prop({ required: true })
  providerKey: string

  @Prop({ required: true, enum: AI_PROVIDER_TYPES })
  providerType: AiProviderType

  @Prop({ required: true, enum: AI_PROVIDER_CATEGORIES })
  category: AiProviderCategory

  @Prop({ required: true })
  label: string

  @Prop({ required: true, default: true })
  enabled: boolean

  @Prop({ required: true, default: false })
  localMode: boolean

  @Prop({ required: true })
  baseUrl: string

  @Prop({ required: true })
  apiKey: string

  @Prop({ required: true })
  model: string

  @Prop()
  callbackUrl?: string

  @Prop()
  timeoutMs?: number

  @Prop({ type: Object, default: {} })
  headers?: Record<string, string>

  @Prop({ type: Object, default: {} })
  extraConfig?: Record<string, unknown>
}

export const AiProviderSettingSchema = SchemaFactory.createForClass(AiProviderSetting)
AiProviderSettingSchema.index({ userId: 1, providerKey: 1 }, { unique: true })
AiProviderSettingSchema.index({ userId: 1, category: 1, enabled: 1 })
