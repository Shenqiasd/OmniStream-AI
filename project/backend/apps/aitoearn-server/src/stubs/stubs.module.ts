import { Module } from '@nestjs/common'
import { AgentStubController, CreditsStubController } from './stubs.controller'

@Module({
  controllers: [AgentStubController, CreditsStubController],
})
export class StubsModule {}
