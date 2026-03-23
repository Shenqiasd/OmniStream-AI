import path from 'node:path'
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AitoearnAuthModule } from '@yikart/aitoearn-auth'
import { AitoearnQueueModule } from '@yikart/aitoearn-queue'
import { ListmonkModule } from '@yikart/listmonk'
import { MailModule } from '@yikart/mail'
import { MongodbModule, UserRepository, UserStatus } from '@yikart/mongodb'
import { AccountModule } from './account/account.module'
import { LogsModule } from './ai/logs'
import { ProviderSettingsModule } from './ai/provider-settings/provider-settings.module'
import { AppConfigModule } from './app-configs/app-config.module'
import { ChannelModule } from './channel/channel.module'
import { config } from './config'
import { ContentModule } from './content/content.module'
import { FeedbackModule } from './feedback/feedback.module'
import { FileModule } from './file/file.module'
import { InternalModule } from './internal/internal.module'
import { McpModule } from './mcp/mcp.module'
import { NotificationModule } from './notification/notification.module'
import { PublishModule } from './publishRecord/publishRecord.module'
import { StatisticsModule } from './statistics/statistics.module'
import { StubsModule } from './stubs/stubs.module'
import { TransportsModule } from './transports/transports.module'
import { UserModule } from './user/user.module'

const LOCAL_DEV_USER_ID = '000000000000000000000001'
const LOCAL_DEV_USER_MAIL = 'local@aitoearn.dev'

@Injectable()
class LocalDevUserBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(LocalDevUserBootstrapService.name)

  constructor(private readonly userRepository: UserRepository) {}

  async onModuleInit() {
    if (!['development', 'local'].includes(config.environment)) {
      return
    }

    const existingUser = await this.userRepository.getUserInfoById(LOCAL_DEV_USER_ID)
    if (existingUser) {
      return
    }

    try {
      await this.userRepository.create({
        _id: LOCAL_DEV_USER_ID,
        name: 'Local Dev User',
        mail: LOCAL_DEV_USER_MAIL,
        status: UserStatus.OPEN,
        isDelete: false,
        score: 0,
        usedStorage: 0,
        storage: {
          total: 500 * 1024 * 1024,
        },
        aiInfo: {},
      } as any)
    }
    catch (error: any) {
      if (error?.code === 11000) {
        return
      }
      throw error
    }

    this.logger.log(`Bootstrapped local user ${LOCAL_DEV_USER_ID}`)
  }
}

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    MongodbModule.forRoot(config.mongodb),
    AitoearnQueueModule.forRoot({
      redis: config.redis,
      prefix: '{bull}',
    }),
    MailModule.forRoot({
      ...config.mail,
      template: {
        dir: path.join(__dirname, 'views'),
      },
    }),
    AitoearnAuthModule.forRoot(config.auth),
    ListmonkModule.forRoot(config.listmonk),
    FileModule,
    LogsModule,
    ProviderSettingsModule,
    TransportsModule,
    AppConfigModule,
    FeedbackModule,
    NotificationModule,
    AccountModule,
    UserModule,
    ContentModule,
    ChannelModule,
    StatisticsModule,
    PublishModule,
    InternalModule,
    McpModule,
    StubsModule,
  ],
  controllers: [],
  providers: [LocalDevUserBootstrapService],
})
export class AppModule { }
