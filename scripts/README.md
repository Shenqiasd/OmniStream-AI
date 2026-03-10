# 数据库初始化脚本

## 使用方法

### 1. 安装依赖

```bash
npm install mongodb
```

### 2. 运行脚本

```bash
# 使用默认配置（localhost:27017/aitoearn）
node scripts/init-db.js

# 使用环境变量自定义配置
MONGO_URI=mongodb://localhost:27017 MONGO_DB=aitoearn node scripts/init-db.js
```

### 3. 使用 Docker Compose

如果使用项目的 Docker Compose 配置：

```bash
# 启动 MongoDB
docker-compose up -d mongodb

# 运行初始化脚本
node scripts/init-db.js
```

## 功能说明

- **幂等性**：脚本可重复运行，已存在的集合不会被重建
- **索引创建**：自动为关键字段创建索引以提升查询性能
- **错误处理**：连接失败或初始化错误会返回非零退出码

## 集合列表

脚本会创建以下集合：

- user（用户）
- account（账号）
- publishTask（发布任务）
- accountGroup、aiLog、apiKey、appConfig、blog、feedback
- material、materialGroup、materialTask
- media、mediaGroup
- notification、oauth2Credential、pointsRecord
- publishDayInfo、publishInfo、publishRecord

## 索引说明

关键索引：
- `user.mail`：邮箱查询
- `user.isDelete`：软删除过滤
- `account.userId`：用户账号关联
- `account.type + uid`：唯一约束
- `publishTask.publishTime`：发布时间排序
