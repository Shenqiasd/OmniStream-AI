import i18next from 'i18next'
import lodash from 'lodash'
import { getUserInfoApi } from '@/api/apiReq'
import { getCreditsBalanceApi } from '@/api/credits'
import { useDataStatisticsStore } from '@/app/[lng]/dataStatistics/useDataStatistics'
import { PublishDatePickerType } from '@/components/PublishDialog/compoents/PublishDatePicker/publishDatePicker.enums'
import { useAccountStore } from '@/store/account'
import { createPersistStore } from '@/utils/createPersistStore'

export interface UserInfo {
  createTime: string
  id: string
  name: string
  password: string
  phone?: string
  mail: string
  salt: string
  status: number
  updateTime: string
  _id: string
  avatar?: string
  isVip?: boolean
  score?: number
  income?: number // 余额字段
  popularizeCode?: string
  vipInfo?: {
    id: string
    expireTime: string
    startTime: string
    status:
      | 'none'
      | 'trialing'
      | 'monthly_once'
      | 'yearly_once'
      | 'active_monthly'
      | 'active_yearly'
      | 'active_nonrenewing'
      | 'expired'
    _id: string
  }
  aiInfo?: {
    image?: {
      defaultModel?: string
      option?: Record<string, any>
    }
    edit?: {
      defaultModel?: string
      option?: Record<string, any>
    }
    video?: {
      defaultModel?: string
      option?: Record<string, any>
    }
    agent?: {
      defaultModel?: string
      option?: Record<string, any>
    }
  }
}

export interface IUserStore {
  // 用户信息
  userInfo?: Partial<UserInfo>
  // 添加账户是否默认开启代理
  isAddAccountPorxy: boolean
  // 语言
  lang: string
  // 当前日期的选择类型 -- 默认
  currentDatePickerType: PublishDatePickerType
  // 当前日期的选择类型
  defaultCurrentDatePickerType: PublishDatePickerType
  // Credits 余额（美分）
  creditsBalance: number
  // Credits 余额加载状态
  creditsLoading: boolean
  // 侧边栏收起状态
  sidebarCollapsed: boolean
}

const LOCAL_USER_INFO: Partial<UserInfo> = {
  id: '000000000000000000000001',
  mail: 'local@aitoearn.dev',
  name: 'Local Dev User',
}

const state: IUserStore = {
  userInfo: LOCAL_USER_INFO,
  isAddAccountPorxy: false,
  lang: i18next.language || 'en',
  defaultCurrentDatePickerType: PublishDatePickerType.DATE,
  currentDatePickerType: PublishDatePickerType.DATE,
  creditsBalance: 0,
  creditsLoading: false,
  sidebarCollapsed: false,
}

function getState(): IUserStore {
  return lodash.cloneDeep(state)
}

export const useUserStore = createPersistStore(
  {
    ...getState(),
  },
  (set, _get) => {
    const methods = {
      // 设置 currentDatePickerType
      setCurrentDatePickerType(type?: PublishDatePickerType) {
        set({ currentDatePickerType: type || _get().defaultCurrentDatePickerType })
      },
      // 设置 defaultCurrentDatePickerType
      setDefaultCurrentDatePickerType(type: PublishDatePickerType) {
        set({ defaultCurrentDatePickerType: type })
      },
      // 设置语言
      setLang(lang: string) {
        set({
          lang,
        })
      },
      setIsAddAccountPorxy(isAddAccountPorxy: boolean) {
        set({ isAddAccountPorxy })
      },
      setUserInfo: (userInfo: UserInfo) => {
        set({ userInfo })
      },

      appInit() {
        useDataStatisticsStore.getState().init()
        set({
          userInfo: {
            ...LOCAL_USER_INFO,
            ..._get().userInfo,
          },
        })
        methods.getUserInfo()
        useAccountStore.getState().accountInit()
      },

      // 获取用户信息
      async getUserInfo() {
        const res = await getUserInfoApi()
        if (res) {
          set({
            userInfo: {
              ...LOCAL_USER_INFO,
              ...res.data,
            },
          })
        }
      },

      // 获取 Credits 余额
      async fetchCreditsBalance() {
        set({ creditsLoading: true })
        try {
          const res = await getCreditsBalanceApi()
          if (res?.data) {
            set({ creditsBalance: res.data.balance })
          }
        }
        finally {
          set({ creditsLoading: false })
        }
      },

      // 设置 Credits 余额
      setCreditsBalance(balance: number) {
        set({ creditsBalance: balance })
      },

      // 设置侧边栏收起状态
      setSidebarCollapsed(collapsed: boolean) {
        set({ sidebarCollapsed: collapsed })
      },

      // 清除登录状态
      clearLoginStatus: () => {
        set({ ...getState() })
        useAccountStore.getState().clear()
      },
    }

    return methods
  },
  {
    name: 'User',
  },
)
