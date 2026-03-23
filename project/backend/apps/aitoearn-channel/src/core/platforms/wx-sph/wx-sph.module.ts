import { Module } from '@nestjs/common'
import { WxSphController } from './wx-sph.controller'
import { WxSphService } from './wx-sph.service'

@Module({
  controllers: [WxSphController],
  providers: [WxSphService],
  exports: [WxSphService],
})
export class WxSphModule {}
