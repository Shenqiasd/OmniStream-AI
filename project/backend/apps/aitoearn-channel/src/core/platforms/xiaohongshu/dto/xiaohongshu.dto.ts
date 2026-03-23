import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export const XiaohongshuSessionCheckSchema = z.object({
  accountId: z.string().optional(),
})

export class XiaohongshuSessionCheckDto extends createZodDto(
  XiaohongshuSessionCheckSchema,
) {}
