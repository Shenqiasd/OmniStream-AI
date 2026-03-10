# AiToEarn 本地部署指南

## 项目简介

AiToEarn 本地版本 - 移除了所有认证系统，可直接在本地环境运行的 AI 内容创作平台。

## 环境要求

- Node.js >= 18
- Docker & Docker Compose
- pnpm >= 8

## 快速启动

### 1. 安装依赖

```bash
# 后端
cd project/backend
pnpm install

# 前端
cd project/web
pnpm install
```

### 2. 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置数据库密码：

```env
MONGODB_USERNAME=admin
MONGODB_PASSWORD=your_mongodb_password
REDIS_PASSWORD=your_redis_password
```

### 3. 启动数据库服务

```bash
docker-compose up -d
```

### 4. 初始化数据库

```bash
node scripts/init-db.js
```

### 5. 配置 AI 服务

编辑 `project/backend/apps/aitoearn-channel/config/ai-services.json`：

```json
{
  "services": {
    "openai": {
      "enabled": true,
      "apiKey": "your-openai-api-key",
      "baseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  }
}
```

支持的 AI 服务：
- OpenAI (GPT-4, GPT-3.5)
- Kling (可灵 AI)
- Volcengine (火山引擎豆包)

### 6. 启动应用

**后端：**

```bash
cd project/backend
pnpm start:dev
```

后端运行在 `http://localhost:3002`

**前端：**

```bash
cd project/web
pnpm dev
```

前端运行在 `http://localhost:3000`

## 环境变量说明

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| MONGODB_USERNAME | MongoDB 用户名 | admin |
| MONGODB_PASSWORD | MongoDB 密码 | your_password |
| REDIS_PASSWORD | Redis 密码 | your_password |

### 可选配置

| 变量 | 说明 |
|------|------|
| FEISHU_WEBHOOK_URL | 飞书通知 Webhook |
| BILIBILI_CLIENT_ID | B站 OAuth |
| GOOGLE_CLIENT_ID | Google OAuth |
| TIKTOK_CLIENT_ID | TikTok OAuth |

完整配置参考 `.env.example`

## AI 服务配置

配置文件位置：`project/backend/apps/aitoearn-channel/config/ai-services.json`

### OpenAI 配置示例

```json
{
  "services": {
    "openai": {
      "enabled": true,
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4", "gpt-3.5-turbo"]
    }
  }
}
```

### 多服务配置示例

```json
{
  "services": {
    "openai": {
      "enabled": true,
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.openai.com/v1",
      "models": ["gpt-4"]
    },
    "kling": {
      "enabled": true,
      "apiKey": "your-kling-key",
      "baseUrl": "https://api.kling.ai",
      "models": ["kling-v1"]
    }
  }
}
```

## 常见问题

### 1. Docker 容器启动失败

检查端口占用：

```bash
lsof -i :27017  # MongoDB
lsof -i :6379   # Redis
```

### 2. 数据库连接失败

确认 Docker 容器运行状态：

```bash
docker ps
```

检查 `.env` 中的数据库密码是否与 `docker-compose.yml` 一致。

### 3. 前端无法连接后端

确认后端已启动在 `http://localhost:3002`，检查前端配置中的 API 地址。

### 4. AI 服务调用失败

- 检查 `ai-services.json` 中的 API Key 是否正确
- 确认 `enabled` 字段为 `true`
- 检查网络连接和 API 配额

## 项目结构

```
AiToEarn/
├── project/
│   ├── backend/          # NestJS 后端
│   ├── web/              # Next.js 前端
│   └── aitoearn-electron # Electron 桌面端
├── scripts/
│   └── init-db.js        # 数据库初始化脚本
├── docker-compose.yml    # Docker 服务配置
└── .env                  # 环境变量配置
```

## 技术栈

- 后端：NestJS + MongoDB + Redis
- 前端：Next.js + React
- 数据库：MongoDB 7 + Redis 7
- AI 服务：OpenAI / Kling / Volcengine
