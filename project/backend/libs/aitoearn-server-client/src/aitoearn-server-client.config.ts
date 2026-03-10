import { createZodDto } from '@yikart/common'
import z from 'zod'

export const aitoearnServerClientConfigSchema = z.object({
  baseUrl: z.string(),
})

export class AitoearnServerClientConfig extends createZodDto(aitoearnServerClientConfigSchema) {}
