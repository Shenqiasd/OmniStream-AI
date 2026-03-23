import { createZodDto } from '@yikart/common'
import { z } from 'zod'

export const DouyinSessionCheckSchema = z.object({
  accountId: z.string().optional(),
})

export class DouyinSessionCheckDto extends createZodDto(
  DouyinSessionCheckSchema,
) {}
