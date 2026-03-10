/**
 * 登录弹窗全局状态管理（已禁用）
 * 本地开发无需登录，所有登录相关功能已移除
 */

import { create } from 'zustand'

export interface ILoginModalStore {
  /** 弹窗是否打开 */
  isOpen: boolean
  /** 登录成功后的回调 */
  onSuccessCallback: (() => void) | null
  /** 打开登录弹窗 */
  openLoginModal: (onSuccess?: () => void) => void
  /** 关闭登录弹窗 */
  closeLoginModal: () => void
  /** 触发成功回调并关闭 */
  handleLoginSuccess: () => void
}

export const useLoginModalStore = create<ILoginModalStore>((set, get) => ({
  isOpen: false,
  onSuccessCallback: null,

  openLoginModal: (onSuccess?: () => void) => {
    // 已禁用登录弹窗 - 本地开发无需登录，直接执行回调
    if (onSuccess) onSuccess()
  },

  closeLoginModal: () => {
    // 无操作
  },

  handleLoginSuccess: () => {
    // 无操作
  },
}))

/**
 * 便捷方法：打开登录弹窗（已禁用，直接执行回调）
 */
export function openLoginModal(onSuccess?: () => void) {
  if (onSuccess) onSuccess()
}

/**
 * 便捷方法：关闭登录弹窗（已禁用）
 */
export function closeLoginModal() {
  // 无操作
}
