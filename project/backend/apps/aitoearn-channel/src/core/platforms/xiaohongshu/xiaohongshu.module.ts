import { Module } from '@nestjs/common'
import { XiaohongshuController } from './xiaohongshu.controller'
import { XiaohongshuService } from './xiaohongshu.service'

@Module({
  controllers: [XiaohongshuController],
  providers: [XiaohongshuService],
  exports: [XiaohongshuService],
})
export class XiaohongshuModule {}
