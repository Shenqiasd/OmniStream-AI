import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export const WxSphSessionCheckSchema = z.object({
  accountId: z.string().optional(),
})

export class WxSphSessionCheckDto extends createZodDto(
  WxSphSessionCheckSchema,
) {}
