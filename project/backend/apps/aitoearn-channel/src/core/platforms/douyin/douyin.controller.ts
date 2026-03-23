import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ApiDoc } from '@yikart/common'
import { DouyinSessionCheckDto } from './dto/douyin.dto'
import { DouyinService } from './douyin.service'

@ApiTags('OpenSource/Core/Platforms/Douyin')
@Controller('douyin')
export class DouyinController {
  constructor(
    private readonly douyinService: DouyinService,
  ) {}

  @ApiDoc({
    summary: 'Check Douyin Session',
    query: DouyinSessionCheckDto.schema,
  })
  @Get('session/check')
  async checkSession(@Query() query: DouyinSessionCheckDto) {
    return await this.douyinService.checkSession(query.accountId)
  }
}
