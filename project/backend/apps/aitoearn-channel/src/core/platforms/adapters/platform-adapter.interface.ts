import { AccountType } from '@yikart/common'
import { PublishService } from '../../publishing/providers/base.service'

export type PlatformAuthMode =
  | 'oauth'
  | 'wechat-open-platform'
  | 'browser-cookie'
  | 'plugin-bridge'
  | 'manual'

export interface PlatformAdapterCapabilities {
  auth: boolean
  refreshCredential: boolean
  queryStatus: boolean
  publishVideo: boolean
  publishArticle: boolean
  publishImage: boolean
  deletePost: boolean
  updatePost: boolean
}

export interface PlatformAdapterDescriptor {
  accountType: AccountType
  label: string
  implemented: boolean
  authMode: PlatformAuthMode
  capabilities: PlatformAdapterCapabilities
  notes?: string
}

export interface PlatformAdapterRuntimeRegistration extends PlatformAdapterDescriptor {
  publishProvider?: PublishService
  getCredentialStatus?: (accountId: string) => Promise<number>
  deletePost?: (accountId: string, postId: string) => Promise<boolean>
}
