import { Injectable, Logger } from '@nestjs/common'
import { PublishTask } from '../../../libs/database/schema/publishTask.schema'
import { DouyinService } from '../../platforms/douyin/douyin.service'
import { CreatePublishDto } from '../dto/publish.dto'
import { PublishingException } from '../publishing.exception'
import { PublishingTaskResult } from '../publishing.interface'
import { PublishService } from './base.service'

@Injectable()
export class DouyinPublishService extends PublishService {
  private readonly logger = new Logger(DouyinPublishService.name)

  constructor(
    private readonly douyinService: DouyinService,
  ) {
    super()
  }

  override async validatePublishParams(publishTask: CreatePublishDto): Promise<{
    success: boolean
    message?: string
  }> {
    if (!this.douyinService.isAutomationConfigured()) {
      return {
        success: false,
        message: 'Douyin automation bridge is not configured',
      }
    }

    if (!publishTask.title && !publishTask.desc) {
      return {
        success: false,
        message: 'Douyin requires at least a title or description',
      }
    }

    if (!publishTask.videoUrl && (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0)) {
      return {
        success: false,
        message: 'Douyin publishing requires images or a video',
      }
    }

    return {
      success: true,
      message: 'Publish params are valid',
    }
  }

  override async immediatePublish(publishTask: PublishTask): Promise<PublishingTaskResult> {
    if (publishTask.videoUrl) {
      this.logger.log(`publishing douyin video for task ${publishTask.id}`)
      return await this.douyinService.publishVideo(publishTask)
    }

    if (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0) {
      throw PublishingException.nonRetryable('Douyin image post requires at least one image')
    }

    this.logger.log(`publishing douyin image post for task ${publishTask.id}`)
    return await this.douyinService.publishContent(publishTask)
  }
}
