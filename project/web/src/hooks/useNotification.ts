import { useCallback, useEffect, useState } from 'react'
import { getUnreadCount } from '@/api/notification'

export function useNotification() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const fetchUnreadCount = useCallback(async () => {
    try {
      setLoading(true)
      const response = await getUnreadCount()
      if (response && response.data) {
        setUnreadCount(response.data.count || 0)
      }
    }
    catch (error) {
      console.error('获取未读数量失败:', error)
    }
    finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUnreadCount()

    const interval = setInterval(() => {
      fetchUnreadCount()
    }, 60000)

    return () => {
      clearInterval(interval)
    }
  }, [fetchUnreadCount])

  return {
    unreadCount,
    loading,
    refreshUnreadCount: fetchUnreadCount,
  }
}
