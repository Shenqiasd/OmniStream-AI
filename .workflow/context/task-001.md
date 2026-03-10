# task-001: 删除登录页面和组件残留

已删除登录页面和组件残留 [REMEMBER] 删除了 auth/login、auth/forgot-password 目录，LoginModal、GlobalLoginModal 组件，loginModal.ts store，清理了 8 个文件中的 openLoginModal 引用 [DECISION] 保留 handleLogin 函数框架供后续实现新登录逻辑
