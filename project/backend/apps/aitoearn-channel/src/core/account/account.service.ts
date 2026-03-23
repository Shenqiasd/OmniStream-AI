import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { QueueService } from '@yikart/aitoearn-queue'
import { AccountStatus, AccountType, AitoearnServerClientService, NewAccount } from '@yikart/aitoearn-server-client'
import { Model } from 'mongoose'
import { TableDto } from '../../common/global/dto/table.dto'
import { Account } from '../../libs/database/schema/account.schema'

type LocalAccountPayload = {
  userId: string
  type: AccountType
  uid: string
  account?: string
  avatar?: string
  nickname: string
  loginTime?: Date | string
  status?: AccountStatus
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name)
  constructor(
    @InjectModel(Account.name)
    private readonly accountModel: Model<Account>,
    private readonly serverClient: AitoearnServerClientService,
    private readonly queueService: QueueService,
  ) { }

  private buildLocalAccountId(
    account: {
      type: AccountType
      uid: string
    },
  ) {
    return `${account.type}_${account.uid}`
  }

  private async upsertLocalAccount(
    accountId: string,
    data: LocalAccountPayload,
  ) {
    const loginTime = data.loginTime ? new Date(data.loginTime) : new Date()
    await this.accountModel.updateOne(
      { _id: accountId },
      {
        _id: accountId,
        userId: data.userId,
        type: data.type,
        uid: data.uid,
        account: data.account,
        avatar: data.avatar,
        nickname: data.nickname,
        loginTime,
        status: data.status ?? AccountStatus.NORMAL,
      },
      { upsert: true },
    ).exec()

    return await this.accountModel.findById(accountId).exec()
  }

  private async syncAccountFromServer(accountId: string) {
    try {
      const account = await this.serverClient.account.getAccountInfoInternal(accountId)
      if (!account) {
        return null
      }
      return await this.upsertLocalAccount(account.id || accountId, {
        userId: account.userId,
        type: account.type,
        uid: account.uid,
        account: account.account,
        avatar: account.avatar,
        nickname: account.nickname,
        loginTime: account.loginTime,
        status: account.status,
      })
    }
    catch (error) {
      this.logger.error(`sync account from server failed: ${error}`)
      return null
    }
  }

  private async syncUserAccountsFromServer(userId: string) {
    try {
      const accounts = await this.serverClient.account.getUserAccounts(userId)
      if (!accounts || accounts.length === 0) {
        return []
      }

      await Promise.all(accounts.map(async account =>
        this.upsertLocalAccount(account.id, {
          userId: account.userId || userId,
          type: account.type,
          uid: account.uid,
          account: account.account,
          avatar: account.avatar,
          nickname: account.nickname,
          loginTime: account.loginTime,
          status: account.status,
        }),
      ))

      return await this.accountModel.find({ userId }).exec()
    }
    catch (error) {
      this.logger.error(`sync user accounts from server failed: ${error}`)
      return []
    }
  }

  /**
   * 创建账户
   * 如果已存在，则更新账户信息
   * @returns
   */
  async createAccount(
    userId: string,
    account: {
      type: AccountType
      uid: string
    },
    data: NewAccount,
  ) {
    this.logger.log(`createAccount: ${JSON.stringify({ account, data })}`)
    const loginTime = new Date()
    const localSeed = data as NewAccount & LocalAccountPayload
    const localAccountId = this.buildLocalAccountId(account)
    const localAccount = await this.upsertLocalAccount(localAccountId, {
      userId,
      type: account.type,
      uid: account.uid,
      account: localSeed.account,
      avatar: localSeed.avatar,
      nickname: localSeed.nickname,
      loginTime,
      status: localSeed.status,
    })

    try {
      const result = await this.serverClient.account.createAccount(data)
      this.logger.log(`create server account success: ${JSON.stringify(result)}`)
      const accountInfo = await this.upsertLocalAccount(result.id || localAccountId, {
        userId: result.userId || userId,
        type: result.type || account.type,
        uid: result.uid || account.uid,
        account: result.account || localSeed.account,
        avatar: result.avatar || localSeed.avatar,
        nickname: result.nickname || localSeed.nickname,
        loginTime: result.loginTime || loginTime,
        status: result.status,
      })
      if (result.id && result.id !== localAccountId) {
        await this.accountModel.deleteOne({ _id: localAccountId }).exec()
      }
      this.queueService.addDumpSocialMediaAvatarJob({ accountId: result.id || localAccountId })
      return accountInfo
    }
    catch (error) {
      this.logger.error(`create server account error: ${error}`)
      return localAccount
    }
  }

  /**
   * 更新账户
   * @returns
   */
  async updateAccountInfo(userId: string, accountId: string, data: NewAccount) {
    const res = await this.accountModel.updateOne({ _id: accountId }, data)

    try {
      await this.serverClient.account.updateAccountInfo(
        accountId,
        {
          userId,
          ...data,
        },
      )
    }
    catch (error) {
      this.logger.error(error)
    }

    return res
  }

  /**
   * 获取信息
   * @returns
   */
  async getAccountInfo(accountId: string) {
    const account = await this.accountModel.findById(accountId).exec()
    if (account) {
      return account
    }
    return await this.syncAccountFromServer(accountId)
  }

  /**
   * 获取列表
   * @param page
   * @param filter
   * @returns
   */
  async getAccountList(page: TableDto, filter: { type?: AccountType } = {}) {
    const list = await this.accountModel.find(
      {
        ...filter,
      },
      {},
      {
        skip: (page.pageNo! - 1) * page.pageSize,
        limit: page.pageSize,
      },
    )

    return {
      list,
      total: await this.accountModel.countDocuments(filter),
    }
  }

  async getUserAccountList(userId: string) {
    const accounts = await this.accountModel.find(
      {
        userId,
      },
    ).exec()
    const syncedAccounts = await this.syncUserAccountsFromServer(userId)
    if (syncedAccounts.length > 0) {
      return syncedAccounts
    }
    return accounts
  }

  /**
   * 更新频道在线状态
   * @param id
   * @param status
   * @returns
   */
  async updateAccountStatus(id: string, status: AccountStatus) {
    return await this.accountModel.updateOne({ _id: id }, { status })
  }
}
