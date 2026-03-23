import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import { AccountStatus, AccountType, AitoearnServerClientService } from '@yikart/aitoearn-server-client'
import axios from 'axios'
import { config } from '../../../config'
import {
  PublishStatus,
  PublishTask,
} from '../../../libs/database/schema/publishTask.schema'
import { PublishingException } from '../../publishing/publishing.exception'
import { PublishingTaskResult } from '../../publishing/publishing.interface'

type JsonRpcContentItem = {
  type?: string
  text?: string
  json?: unknown
  data?: unknown
}

type JsonObject = Record<string, unknown>

@Injectable()
export class XiaohongshuService {
  private readonly logger = new Logger(XiaohongshuService.name)

  constructor(
    private readonly serverClient: AitoearnServerClientService,
  ) {}

  isAutomationConfigured(): boolean {
    return Boolean(config.xiaohongshu?.mcpUrl?.trim())
  }

  private getMcpUrl(): string {
    return config.xiaohongshu?.mcpUrl?.trim() || ''
  }

  private getMcpTimeoutMs(): number {
    return config.xiaohongshu?.timeoutMs || 30000
  }

  private getMcpHeaders(sessionId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    }
    if (config.xiaohongshu?.mcpAuthToken) {
      headers.Authorization = `Bearer ${config.xiaohongshu.mcpAuthToken}`
    }
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId
    }
    return headers
  }

  private asObject(value: unknown): JsonObject | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined
    }
    return value as JsonObject
  }

  private getNestedValue(record: JsonObject | undefined, path: string): unknown {
    if (!record) {
      return undefined
    }
    return path.split('.').reduce<unknown>((acc, part) => {
      const current = this.asObject(acc)
      return current?.[part]
    }, record)
  }

  private getNestedString(record: JsonObject | undefined, paths: string[]): string | undefined {
    for (const path of paths) {
      const value = this.getNestedValue(record, path)
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
      if (typeof value === 'number') {
        return `${value}`
      }
    }
    return undefined
  }

  private getNestedBoolean(record: JsonObject | undefined, paths: string[]): boolean | undefined {
    for (const path of paths) {
      const value = this.getNestedValue(record, path)
      if (typeof value === 'boolean') {
        return value
      }
    }
    return undefined
  }

  private parseTextContent(text: string): unknown {
    const trimmed = text.trim()
    if (!trimmed) {
      return ''
    }
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return JSON.parse(trimmed)
      }
      catch {
        return trimmed
      }
    }
    return trimmed
  }

  private normalizeMcpResult(result: unknown): unknown {
    const resultObject = this.asObject(result)
    const structuredContent = resultObject?.structuredContent
    if (structuredContent !== undefined) {
      return structuredContent
    }

    const content = resultObject?.content
    if (Array.isArray(content)) {
      const parsedContent = content.map((item) => {
        const typedItem = item as JsonRpcContentItem
        if (typedItem.json !== undefined) {
          return typedItem.json
        }
        if (typedItem.data !== undefined) {
          return typedItem.data
        }
        if (typeof typedItem.text === 'string') {
          return this.parseTextContent(typedItem.text)
        }
        return item
      })
      if (parsedContent.length === 1) {
        return parsedContent[0]
      }
      return parsedContent
    }

    return result
  }

  private async initializeMcpSession(): Promise<string | undefined> {
    const mcpUrl = this.getMcpUrl()
    if (!mcpUrl) {
      return undefined
    }

    const initResponse = await axios.post(
      mcpUrl,
      {
        jsonrpc: '2.0',
        id: `initialize-${Date.now()}`,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'aitoearn-channel',
            version: 'local-dev',
          },
        },
      },
      {
        headers: this.getMcpHeaders(),
        timeout: this.getMcpTimeoutMs(),
        validateStatus: () => true,
      },
    )

    if (initResponse.status >= 400) {
      throw new Error(`Xiaohongshu MCP initialize failed with status ${initResponse.status}`)
    }

    const sessionId = initResponse.headers['mcp-session-id'] as string | undefined
    if (sessionId) {
      await axios.post(
        mcpUrl,
        {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        },
        {
          headers: this.getMcpHeaders(sessionId),
          timeout: this.getMcpTimeoutMs(),
          validateStatus: () => true,
        },
      )
    }

    return sessionId
  }

  private async callMcpTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    if (!this.isAutomationConfigured()) {
      throw new Error('Xiaohongshu MCP is not configured')
    }

    const sessionId = await this.initializeMcpSession()
    const response = await axios.post(
      this.getMcpUrl(),
      {
        jsonrpc: '2.0',
        id: `tool-${Date.now()}`,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      },
      {
        headers: this.getMcpHeaders(sessionId),
        timeout: this.getMcpTimeoutMs(),
        validateStatus: () => true,
      },
    )

    if (response.status >= 400) {
      throw new Error(`Xiaohongshu MCP tool ${name} failed with status ${response.status}`)
    }
    if (response.data?.error) {
      throw new Error(response.data.error.message || `Xiaohongshu MCP tool ${name} failed`)
    }

    return this.normalizeMcpResult(response.data?.result) as T
  }

  private normalizeSessionValidity(payload: unknown): boolean {
    if (typeof payload === 'boolean') {
      return payload
    }

    if (typeof payload === 'string') {
      const text = payload.toLowerCase()
      if (text.includes('logged in') || text.includes('已登录') || text.includes('login success')) {
        return true
      }
      if (text.includes('not logged in') || text.includes('未登录') || text.includes('login required')) {
        return false
      }
    }

    const payloadObject = this.asObject(payload)
    const flag = this.getNestedBoolean(payloadObject, [
      'valid',
      'loggedIn',
      'logged_in',
      'authenticated',
      'isLoggedIn',
      'is_logged_in',
      'success',
    ])
    return flag ?? false
  }

  private buildPublishContent(publishTask: Pick<PublishTask, 'desc' | 'topics'>): string {
    const desc = publishTask.desc?.trim() || ''
    const topics = publishTask.topics?.length
      ? `#${publishTask.topics.join(' #')}`
      : ''
    return [desc, topics].filter(Boolean).join('\n\n').trim()
  }

  private resolvePublishTitle(publishTask: Pick<PublishTask, 'title' | 'desc'>): string {
    const title = publishTask.title?.trim()
    if (title) {
      return title
    }
    const desc = publishTask.desc?.trim()
    if (desc) {
      return desc.slice(0, 20)
    }
    return 'AiToEarn'
  }

  private normalizePublishResult(payload: unknown): PublishingTaskResult {
    const payloadObject = this.asObject(payload)
    const permalink = this.getNestedString(payloadObject, [
      'url',
      'permalink',
      'note_url',
      'data.url',
      'data.permalink',
    ])

    let postId = this.getNestedString(payloadObject, [
      'postId',
      'noteId',
      'note_id',
      'publishId',
      'id',
      'data.postId',
      'data.noteId',
      'data.note_id',
      'data.id',
    ])

    if (!postId && permalink) {
      postId = permalink
    }
    if (!postId) {
      throw PublishingException.nonRetryable('Xiaohongshu publish result did not include a post identifier')
    }

    const rawStatus = this.getNestedString(payloadObject, [
      'status',
      'data.status',
    ])?.toLowerCase()

    return {
      postId,
      permalink: permalink || '',
      status: rawStatus === 'publishing'
        ? PublishStatus.PUBLISHING
        : PublishStatus.PUBLISHED,
      extra: payloadObject ? { dataOption: payloadObject } : undefined,
    }
  }

  private async resolveAccountSummary(accountId?: string) {
    if (!accountId) {
      return undefined
    }

    try {
      const account = await this.serverClient.account.getAccountInfoInternal(accountId)
      if (!account) {
        return {
          id: accountId,
          found: false,
        }
      }
      return {
        id: account.id,
        type: account.type,
        uid: account.uid,
        nickname: account.nickname,
        cookieStored: Boolean(account.loginCookie),
      }
    }
    catch (error) {
      this.logger.warn(`load xiaohongshu account ${accountId} failed: ${error}`)
      return {
        id: accountId,
        found: false,
      }
    }
  }

  private async ensureSingleBoundAccount(accountId: string, userId: string) {
    const selectedAccount = await this.serverClient.account.getAccountInfoInternal(accountId)
    if (!selectedAccount || selectedAccount.type !== AccountType.Xhs) {
      throw PublishingException.nonRetryable('Selected Xiaohongshu account is not available')
    }

    const userAccounts = await this.serverClient.account.getUserAccounts(userId)
    const xhsAccounts = userAccounts.filter(account => account.type === AccountType.Xhs)
    if (xhsAccounts.length > 1) {
      throw PublishingException.nonRetryable(
        'Xiaohongshu MCP bridge is single-session. Keep only one Xiaohongshu account bound before publishing.',
      )
    }

    return selectedAccount
  }

  private async prepareLocalVideoPath(videoUrl: string) {
    if (videoUrl.startsWith('/')) {
      return {
        filePath: videoUrl,
        cleanupPath: undefined as string | undefined,
      }
    }

    const originalExt = extname(videoUrl.split('?')[0]) || '.mp4'
    const tempDir = resolve(process.cwd(), 'tmp', 'xiaohongshu-mcp')
    await mkdir(tempDir, { recursive: true })
    const filePath = resolve(tempDir, `${randomUUID()}${originalExt}`)
    const response = await axios.get<ArrayBuffer>(videoUrl, {
      responseType: 'arraybuffer',
      timeout: this.getMcpTimeoutMs(),
    })
    await writeFile(filePath, Buffer.from(response.data))
    return {
      filePath,
      cleanupPath: filePath,
    }
  }

  async checkSession(accountId?: string) {
    const account = await this.resolveAccountSummary(accountId)
    const base = {
      platform: AccountType.Xhs,
      configured: this.isAutomationConfigured(),
      implemented: this.isAutomationConfigured(),
      mode: 'mcp-single-session',
      accountScoped: false,
      account,
    }

    if (!this.isAutomationConfigured()) {
      return {
        ...base,
        valid: false,
        message: 'Set XIAOHONGSHU_MCP_URL to enable Xiaohongshu automation bridge. Login still happens in the external MCP bridge.',
      }
    }

    const payload = await this.callMcpTool('check_login_status', {})
    return {
      ...base,
      valid: this.normalizeSessionValidity(payload),
      session: payload,
    }
  }

  async publishContent(publishTask: PublishTask): Promise<PublishingTaskResult> {
    await this.ensureSingleBoundAccount(publishTask.accountId, publishTask.userId)
    const payload = await this.callMcpTool(
      'publish_content',
      {
        title: this.resolvePublishTitle(publishTask),
        content: this.buildPublishContent(publishTask),
        images: publishTask.imgUrlList || [],
      },
    )

    return this.normalizePublishResult(payload)
  }

  async publishVideo(publishTask: PublishTask): Promise<PublishingTaskResult> {
    if (!publishTask.videoUrl) {
      throw PublishingException.nonRetryable('Xiaohongshu video publishing requires a videoUrl')
    }

    await this.ensureSingleBoundAccount(publishTask.accountId, publishTask.userId)
    const { filePath, cleanupPath } = await this.prepareLocalVideoPath(publishTask.videoUrl)
    try {
      const payload = await this.callMcpTool(
        'publish_with_video',
        {
          title: this.resolvePublishTitle(publishTask),
          content: this.buildPublishContent(publishTask),
          video_path: filePath,
        },
      )

      return this.normalizePublishResult(payload)
    }
    finally {
      if (cleanupPath) {
        await rm(cleanupPath, { force: true })
      }
    }
  }
}
