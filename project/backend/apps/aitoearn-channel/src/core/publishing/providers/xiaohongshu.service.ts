import { Injectable, Logger } from '@nestjs/common'
import { PublishTask } from '../../../libs/database/schema/publishTask.schema'
import { XiaohongshuService } from '../../platforms/xiaohongshu/xiaohongshu.service'
import { CreatePublishDto } from '../dto/publish.dto'
import { PublishingException } from '../publishing.exception'
import { PublishingTaskResult } from '../publishing.interface'
import { PublishService } from './base.service'

@Injectable()
export class XiaohongshuPublishService extends PublishService {
  private readonly logger = new Logger(XiaohongshuPublishService.name)

  constructor(
    private readonly xiaohongshuService: XiaohongshuService,
  ) {
    super()
  }

  override async validatePublishParams(publishTask: CreatePublishDto): Promise<{
    success: boolean
    message?: string
  }> {
    if (!this.xiaohongshuService.isAutomationConfigured()) {
      return {
        success: false,
        message: 'Xiaohongshu automation bridge is not configured',
      }
    }

    if (!publishTask.title && !publishTask.desc) {
      return {
        success: false,
        message: 'Xiaohongshu requires at least a title or description',
      }
    }

    if (!publishTask.videoUrl && (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0)) {
      return {
        success: false,
        message: 'Xiaohongshu publishing requires images or a video',
      }
    }

    return {
      success: true,
      message: 'Publish params are valid',
    }
  }

  override async immediatePublish(publishTask: PublishTask): Promise<PublishingTaskResult> {
    if (publishTask.videoUrl) {
      this.logger.log(`publishing xiaohongshu video for task ${publishTask.id}`)
      return await this.xiaohongshuService.publishVideo(publishTask)
    }

    if (!publishTask.imgUrlList || publishTask.imgUrlList.length === 0) {
      throw PublishingException.nonRetryable('Xiaohongshu image note requires at least one image')
    }

    this.logger.log(`publishing xiaohongshu image note for task ${publishTask.id}`)
    return await this.xiaohongshuService.publishContent(publishTask)
  }
}
