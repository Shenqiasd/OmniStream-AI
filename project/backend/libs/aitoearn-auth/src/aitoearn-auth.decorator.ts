import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import { IS_INTERNAL_KEY, IS_PUBLIC_KEY } from './aitoearn-auth.constants'

const LOCAL_DEV_TOKEN = {
  id: '000000000000000000000001',
  mail: 'local@aitoearn.dev',
  email: 'local@aitoearn.dev',
  name: 'Local Dev User',
  type: 'user',
}

export const GetToken = createParamDecorator(
  (_data: string, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    return req['user'] || LOCAL_DEV_TOKEN
  },
)

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
export const Internal = () => SetMetadata(IS_INTERNAL_KEY, true)
