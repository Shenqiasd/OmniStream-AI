import { Injectable, Logger } from '@nestjs/common'
import { PublishTask } from '../../../libs/database/schema/publishTask.schema'
import { WxSphService } from '../../platforms/wx-sph/wx-sph.service'
import { CreatePublishDto } from '../dto/publish.dto'
import { PublishingException } from '../publishing.exception'
import { PublishingTaskResult } from '../publishing.interface'
import { PublishService } from './base.service'

@Injectable()
export class WxSphPublishService extends PublishService {
  private readonly logger = new Logger(WxSphPublishService.name)

  constructor(
    private readonly wxSphService: WxSphService,
  ) {
    super()
  }

  override async validatePublishParams(publishTask: CreatePublishDto): Promise<{
    success: boolean
    message?: string
  }> {
    if (!this.wxSphService.isAutomationConfigured()) {
      return {
        success: false,
        message: 'WeChat Channels automation bridge is not configured',
      }
    }

    if (!publishTask.title && !publishTask.desc) {
      return {
        success: false,
        message: 'WeChat Channels requires at least a title or description',
      }
    }

    if (!publishTask.videoUrl && (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0)) {
      return {
        success: false,
        message: 'WeChat Channels publishing requires images or a video',
      }
    }

    return {
      success: true,
      message: 'Publish params are valid',
    }
  }

  override async immediatePublish(publishTask: PublishTask): Promise<PublishingTaskResult> {
    if (publishTask.videoUrl) {
      this.logger.log(`publishing wxSph video for task ${publishTask.id}`)
      return await this.wxSphService.publishVideo(publishTask)
    }

    if (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0) {
      throw PublishingException.nonRetryable('WeChat Channels image post requires at least one image')
    }

    this.logger.log(`publishing wxSph image post for task ${publishTask.id}`)
    return await this.wxSphService.publishContent(publishTask)
  }
}
