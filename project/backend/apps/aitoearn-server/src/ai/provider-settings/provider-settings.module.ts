import { Module } from '@nestjs/common'
import { ProviderSettingsController } from './provider-settings.controller'
import { ProviderSettingsService } from './provider-settings.service'

@Module({
  controllers: [ProviderSettingsController],
  providers: [ProviderSettingsService],
  exports: [ProviderSettingsService],
})
export class ProviderSettingsModule {}
