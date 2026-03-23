import { Injectable } from '@nestjs/common'
import { AccountType } from '@yikart/common'
import { BilibiliPubService } from '../../publishing/providers/bilibili.service'
import { DouyinPublishService } from '../../publishing/providers/douyin.service'
import { XiaohongshuPublishService } from '../../publishing/providers/xiaohongshu.service'
import { TiktokPubService } from '../../publishing/providers/tiktok.service'
import { WxGzhPubService } from '../../publishing/providers/wx-gzh.service'
import { WxSphPublishService } from '../../publishing/providers/wx-sph.service'
import { BilibiliService } from '../bilibili/bilibili.service'
import { DouyinService } from '../douyin/douyin.service'
import { TiktokService } from '../tiktok/tiktok.service'
import { WxGzhService } from '../wx-plat/wx-gzh.service'
import { WxSphService } from '../wx-sph/wx-sph.service'
import { XiaohongshuService } from '../xiaohongshu/xiaohongshu.service'
import {
  PlatformAdapterDescriptor,
  PlatformAdapterRuntimeRegistration,
} from './platform-adapter.interface'

@Injectable()
export class PlatformAdapterRegistryService {
  constructor(
    private readonly bilibiliService: BilibiliService,
    private readonly douyinService: DouyinService,
    private readonly xiaohongshuService: XiaohongshuService,
    private readonly tiktokService: TiktokService,
    private readonly wxGzhService: WxGzhService,
    private readonly wxSphService: WxSphService,
    private readonly bilibiliPubService: BilibiliPubService,
    private readonly douyinPublishService: DouyinPublishService,
    private readonly xiaohongshuPublishService: XiaohongshuPublishService,
    private readonly tiktokPubService: TiktokPubService,
    private readonly wxGzhPubService: WxGzhPubService,
    private readonly wxSphPublishService: WxSphPublishService,
  ) {}

  private get adapters(): PlatformAdapterRuntimeRegistration[] {
    return [
      {
        accountType: AccountType.BILIBILI,
        label: 'Bilibili',
        implemented: true,
        authMode: 'oauth',
        capabilities: {
          auth: true,
          refreshCredential: true,
          queryStatus: true,
          publishVideo: true,
          publishArticle: false,
          publishImage: false,
          deletePost: true,
          updatePost: false,
        },
        publishProvider: this.bilibiliPubService,
        getCredentialStatus: accountId => this.bilibiliService.getAccessTokenStatus(accountId),
        deletePost: (accountId, postId) => this.bilibiliService.deletePost(accountId, postId),
      },
      {
        accountType: AccountType.Douyin,
        label: 'Douyin',
        implemented: this.douyinService.isAutomationConfigured(),
        authMode: 'browser-cookie',
        capabilities: {
          auth: false,
          refreshCredential: false,
          queryStatus: this.douyinService.isAutomationConfigured(),
          publishVideo: this.douyinService.isAutomationConfigured(),
          publishArticle: this.douyinService.isAutomationConfigured(),
          publishImage: this.douyinService.isAutomationConfigured(),
          deletePost: false,
          updatePost: false,
        },
        notes: this.douyinService.isAutomationConfigured()
          ? 'Douyin publishing is enabled through a configured MCP single-session bridge. Login remains external to AiToEarn, and only one bound Douyin account is supported at a time.'
          : 'Douyin automation bridge is not configured. Set DOUYIN_MCP_URL to enable it.',
        publishProvider: this.douyinService.isAutomationConfigured()
          ? this.douyinPublishService
          : undefined,
      },
      {
        accountType: AccountType.Xhs,
        label: 'Xiaohongshu',
        implemented: this.xiaohongshuService.isAutomationConfigured(),
        authMode: 'browser-cookie',
        capabilities: {
          auth: false,
          refreshCredential: false,
          queryStatus: this.xiaohongshuService.isAutomationConfigured(),
          publishVideo: this.xiaohongshuService.isAutomationConfigured(),
          publishArticle: this.xiaohongshuService.isAutomationConfigured(),
          publishImage: this.xiaohongshuService.isAutomationConfigured(),
          deletePost: false,
          updatePost: false,
        },
        notes: this.xiaohongshuService.isAutomationConfigured()
          ? 'Xiaohongshu publishing is enabled through a configured MCP single-session bridge. Login remains external to AiToEarn, and only one bound Xiaohongshu account is supported at a time.'
          : 'Xiaohongshu automation bridge is not configured. Set XIAOHONGSHU_MCP_URL to enable it.',
        publishProvider: this.xiaohongshuService.isAutomationConfigured()
          ? this.xiaohongshuPublishService
          : undefined,
      },
      {
        accountType: AccountType.WxSph,
        label: 'WeChat Channels',
        implemented: this.wxSphService.isAutomationConfigured(),
        authMode: 'plugin-bridge',
        capabilities: {
          auth: false,
          refreshCredential: false,
          queryStatus: this.wxSphService.isAutomationConfigured(),
          publishVideo: this.wxSphService.isAutomationConfigured(),
          publishImage: this.wxSphService.isAutomationConfigured(),
          publishArticle: false,
          deletePost: false,
          updatePost: false,
        },
        notes: this.wxSphService.isAutomationConfigured()
          ? 'WeChat Channels publishing is enabled through a configured MCP single-session bridge. Login remains external to AiToEarn, and only one bound WeChat Channels account is supported at a time.'
          : 'WeChat Channels automation bridge is not configured. Set WXSPH_MCP_URL to enable it.',
        publishProvider: this.wxSphService.isAutomationConfigured()
          ? this.wxSphPublishService
          : undefined,
      },
      {
        accountType: AccountType.TIKTOK,
        label: 'TikTok',
        implemented: true,
        authMode: 'oauth',
        capabilities: {
          auth: true,
          refreshCredential: true,
          queryStatus: true,
          publishVideo: true,
          publishArticle: false,
          publishImage: false,
          deletePost: false,
          updatePost: false,
        },
        publishProvider: this.tiktokPubService,
        getCredentialStatus: accountId => this.tiktokService.getAccessTokenStatus(accountId),
      },
      {
        accountType: AccountType.WxGzh,
        label: 'WeChat Official Account',
        implemented: true,
        authMode: 'wechat-open-platform',
        capabilities: {
          auth: true,
          refreshCredential: true,
          queryStatus: true,
          publishVideo: false,
          publishArticle: true,
          publishImage: false,
          deletePost: true,
          updatePost: false,
        },
        publishProvider: this.wxGzhPubService,
        getCredentialStatus: async (accountId) => {
          const res = await this.wxGzhService.checkAuth(accountId)
          return res.status
        },
        deletePost: async (accountId, postId) => {
          await this.wxGzhService.deleteArticle(accountId, postId)
          return true
        },
      },
    ]
  }

  list(): PlatformAdapterDescriptor[] {
    return this.adapters.map(({ publishProvider: _publishProvider, getCredentialStatus: _getCredentialStatus, deletePost: _deletePost, ...descriptor }) => descriptor)
  }

  get(accountType: AccountType) {
    return this.adapters.find(adapter => adapter.accountType === accountType)
  }

  getPublishProvider(accountType: AccountType) {
    return this.get(accountType)?.publishProvider
  }

  async getCredentialStatus(accountType: AccountType, accountId: string) {
    const adapter = this.get(accountType)
    if (!adapter?.getCredentialStatus) {
      return undefined
    }
    return await adapter.getCredentialStatus(accountId)
  }

  async deletePublishedPost(accountType: AccountType, accountId: string, postId: string) {
    const adapter = this.get(accountType)
    if (!adapter?.deletePost) {
      return undefined
    }
    return await adapter.deletePost(accountId, postId)
  }
}
