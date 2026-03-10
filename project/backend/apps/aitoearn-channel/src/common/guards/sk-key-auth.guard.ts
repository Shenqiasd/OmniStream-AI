import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SkKeyService } from '../../core/sk-key/sk-key.service'

export const GetSkKey = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    return req['skKey']
  },
)

@Injectable()
export class SkKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(SkKeyAuthGuard.name)
  constructor(
    private reflector: Reflector,
    private readonly skKeyService: SkKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 认证已禁用，直接放行所有请求
    return true
  }
}
