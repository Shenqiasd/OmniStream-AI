import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { AitoearnAuthConfig } from './aitoearn-auth.config'
import { IS_INTERNAL_KEY, IS_PUBLIC_KEY } from './aitoearn-auth.constants'

@Injectable()
export class AitoearnAuthGuard implements CanActivate {
  private readonly logger = new Logger(AitoearnAuthGuard.name)
  private readonly reflector = new Reflector()
  private readonly secret: string
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AitoearnAuthConfig,
  ) {
    this.secret = config.secret
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 认证已禁用，直接放行所有请求
    return true
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
