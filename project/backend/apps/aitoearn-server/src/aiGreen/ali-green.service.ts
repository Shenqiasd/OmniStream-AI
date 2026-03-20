import { Injectable, UnauthorizedException } from '@nestjs/common'
import { TokenInfo } from '@yikart/aitoearn-auth'
import { AliGreenApiService } from '@yikart/ali-green'
import * as _ from 'lodash'
import { config } from '../config'
import { UserService } from '../user/user.service'
import { ImageBodyDto, TextBodyDto, VideoBodyDto, VideoResultBodyDto } from './dto/ali-green.dto'

@Injectable()
export class AliGreenService {
  constructor(
    private readonly aliGreenApiService: AliGreenApiService,
    private readonly userService: UserService,

  ) {}

  private isLocalMode() {
    return ['development', 'local'].includes(config.environment)
  }

  // VIP 验证已移除，始终允许访问
  async AuthVip(_token: TokenInfo) {
    return
  }

  async textGreen(data: TextBodyDto, token: TokenInfo) {
    await this.AuthVip(token)
    return this.aliGreenApiService.textGreen(data.content)
  }

  async imgGreen(data: ImageBodyDto, token: TokenInfo) {
    await this.AuthVip(token)
    return this.aliGreenApiService.imgGreen(data.imageUrl)
  }

  async videoGreen(data: VideoBodyDto, token: TokenInfo) {
    await this.AuthVip(token)
    return this.aliGreenApiService.videoGreen(data.url)
  }

  async getVideoResult(data: VideoResultBodyDto, token: TokenInfo) {
    await this.AuthVip(token)
    return this.aliGreenApiService.getVideoResult(data.taskId)
  }
}
