import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApiDoc } from '@yikart/common'
import { WxSphSessionCheckDto } from './dto/wx-sph.dto'
import { WxSphService } from './wx-sph.service'

@ApiTags('OpenSource/Core/Platforms/WxSph')
@Controller('wx-sph')
export class WxSphController {
  constructor(
    private readonly wxSphService: WxSphService,
  ) {}

  @ApiDoc({
    summary: 'Check WeChat Channels Session',
    query: WxSphSessionCheckDto.schema,
  })
  @Get('session/check')
  async checkSession(@Query() query: WxSphSessionCheckDto) {
    return await this.wxSphService.checkSession(query.accountId)
  }
}
