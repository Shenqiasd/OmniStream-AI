import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApiDoc } from '@yikart/common'
import { XiaohongshuSessionCheckDto } from './dto/xiaohongshu.dto'
import { XiaohongshuService } from './xiaohongshu.service'

@ApiTags('OpenSource/Core/Platforms/Xiaohongshu')
@Controller('xiaohongshu')
export class XiaohongshuController {
  constructor(
    private readonly xiaohongshuService: XiaohongshuService,
  ) {}

  @ApiDoc({
    summary: 'Check Xiaohongshu Session',
    query: XiaohongshuSessionCheckDto.schema,
  })
  @Get('session/check')
  async checkSession(@Query() query: XiaohongshuSessionCheckDto) {
    return await this.xiaohongshuService.checkSession(query.accountId)
  }
}
