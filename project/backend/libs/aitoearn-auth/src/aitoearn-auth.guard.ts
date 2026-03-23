import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { AitoearnAuthConfig } from './aitoearn-auth.config'
import { TokenInfo } from './aitoearn-auth.interface'

const LOCAL_DEV_TOKEN: TokenInfo & { email: string, type: string } = {
  id: '000000000000000000000001',
  mail: 'local@aitoearn.dev',
  email: 'local@aitoearn.dev',
  name: 'Local Dev User',
  type: 'user',
}

@Injectable()
export class AitoearnAuthGuard implements CanActivate {
  private readonly logger = new Logger(AitoearnAuthGuard.name)
  private readonly secret: string
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: AitoearnAuthConfig,
  ) {
    this.secret = config.secret
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    request.user = {
      ...LOCAL_DEV_TOKEN,
      ...request.user,
    }
    return true
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
