import { createZodDto } from '@yikart/common'
import { AI_PROVIDER_CATEGORIES, AI_PROVIDER_TYPES } from '@yikart/mongodb'
import { z } from 'zod'

export const providerSettingBodySchema = z.object({
  providerKey: z.string().min(1),
  providerType: z.enum(AI_PROVIDER_TYPES),
  category: z.enum(AI_PROVIDER_CATEGORIES),
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  localMode: z.boolean().default(false),
  baseUrl: z.string().url(),
  apiKey: z.string().optional().default(''),
  model: z.string().min(1),
  callbackUrl: z.string().url().optional(),
  timeoutMs: z.number().int().positive().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  extraConfig: z.record(z.string(), z.unknown()).optional(),
})

export class UpsertProviderSettingDto extends createZodDto(providerSettingBodySchema) {}

export const getProviderSettingSchema = z.object({
  providerKey: z.string().min(1),
})

export class GetProviderSettingDto extends createZodDto(getProviderSettingSchema) {}

export const deleteProviderSettingSchema = z.object({
  providerKey: z.string().min(1),
})

export class DeleteProviderSettingDto extends createZodDto(deleteProviderSettingSchema) {}

export const testProviderConnectionSchema = providerSettingBodySchema.pick({
  providerKey: true,
  providerType: true,
  baseUrl: true,
  apiKey: true,
  model: true,
  timeoutMs: true,
  headers: true,
})

export class TestProviderConnectionDto extends createZodDto(testProviderConnectionSchema) {}
