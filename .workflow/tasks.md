1. [frontend] 删除登录页面和组件残留
   删除 auth/login、auth/forgot-password 目录，清理 25 个文件中的登录组件引用
2. [backend] 修复 AI 服务加载器日志规范
   将 ai-services-loader.js 中的 console.error 改为 Logger
3. [general] 完善环境变量模板
   在 .env.example 中添加 AI 服务配置示例（OPENAI_API_KEY、KLING_API_KEY 等）
