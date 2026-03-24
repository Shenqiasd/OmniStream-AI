const os = require('node:os')

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
} = process.env

const {
  MONGODB_URL,
  MONGODB_HOST,
  MONGODB_PORT,
  MONGODB_USERNAME,
  MONGODB_PASSWORD,
} = process.env

const {
  STATISTICS_DB_HOST,
  STATISTICS_DB_PORT,
  STATISTICS_DB_USERNAME,
  STATISTICS_DB_PASSWORD,
} = process.env

const {
  CHANNEL_URL,
} = process.env

const {
  JWT_SECRET,
} = process.env

const {
  APP_ENV = 'production',
  APP_NAME = 'aitoearn-server',
  NODE_ENV = 'production',
} = process.env

const {
  FEISHU_WEBHOOK_URL,
  FEISHU_WEBHOOK_SECRET,
} = process.env

const {
  MAIL_USER,
  MAIL_PASS,
} = process.env

const {
  KLING_ACCESS_KEY,
  KLING_BASE_URL,
  VOLCENGINE_API_KEY,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  DASHSCOPE_API_KEY,
  DASHSCOPE_BASE_URL,
  SORA2_API_KEY,
  SORA2_BASE_URL,
  MD2CARD_API_KEY,
} = process.env

const {
  ALI_GREEN_ACCESS_KEY_ID,
  ALI_GREEN_ACCESS_KEY_SECRET,
} = process.env

const {
  INTERNAL_TOKEN,
} = process.env

const {
  LISTMONK_HOST,
  LISTMONK_API_KEY,
  LISTMONK_API_SECRET,
} = process.env

// Build MongoDB URI: prefer MONGODB_URL (Railway provides this), fallback to individual parts
function buildMongoUri() {
  if (MONGODB_URL) return MONGODB_URL
  if (MONGODB_USERNAME && MONGODB_PASSWORD) {
    return `mongodb://${MONGODB_USERNAME}:${encodeURIComponent(MONGODB_PASSWORD)}@${MONGODB_HOST}:${MONGODB_PORT}/?authSource=admin&directConnection=true`
  }
  return `mongodb://${MONGODB_HOST || 'localhost'}:${MONGODB_PORT || 27017}`
}

function buildStatisticsDbUri() {
  if (STATISTICS_DB_USERNAME && STATISTICS_DB_PASSWORD) {
    return `mongodb://${STATISTICS_DB_USERNAME}:${encodeURIComponent(STATISTICS_DB_PASSWORD)}@${STATISTICS_DB_HOST}:${STATISTICS_DB_PORT}/?authSource=admin&directConnection=true`
  }
  return buildMongoUri()
}

module.exports = {
  port: Number(process.env.PORT) || 3002,
  environment: NODE_ENV,
  logger: {
    console: {
      enable: true,
      level: 'debug',
    },
    cloudWatch: {
      enable: false,
      region: 'ap-southeast-1',
      group: `aitoearn-apps/${APP_ENV}/${APP_NAME}`,
      stream: `${os.hostname()}`,
    },
    feishu: {
      enable: !!FEISHU_WEBHOOK_URL,
      url: FEISHU_WEBHOOK_URL || '',
      secret: FEISHU_WEBHOOK_SECRET || '',
    },
    mongodb: {
      enable: false,
      db: buildMongoUri(),
      collection: 'logs',
      level: 'error',
    },
  },
  enableBadRequestDetails: true,
  redis: {
    host: REDIS_HOST || 'localhost',
    port: Number(REDIS_PORT) || 6379,
    db: 1,
    password: REDIS_PASSWORD || undefined,
  },
  mail: {
    transport: {
      host: 'smtp.feishu.cn',
      port: 587,
      secure: false,
      auth: {
        user: MAIL_USER || '',
        pass: MAIL_PASS || '',
      },
    },
    defaults: {
      from: 'hello@aiearn.ai',
    },
  },
  redlock: {
    redis: {
      host: REDIS_HOST || 'localhost',
      port: Number(REDIS_PORT) || 6379,
      db: 1,
      password: REDIS_PASSWORD || undefined,
    },
  },
  mongodb: {
    uri: buildMongoUri(),
    dbName: 'aitoearn',
  },
  ai: {
    fireflycard: {
      apiUrl: 'https://fireflycard-api.302ai.cn/api/saveImg',
    },
    md2card: {
      baseUrl: 'https://md2card.cn',
      apiKey: MD2CARD_API_KEY || '',
    },
    kling: {
      baseUrl: KLING_BASE_URL || '',
      accessKey: KLING_ACCESS_KEY || '',
    },
    volcengine: {
      baseUrl: 'https://ark.cn-beijing.volces.com/',
      apiKey: VOLCENGINE_API_KEY || '',
    },
    openai: {
      baseUrl: OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: OPENAI_API_KEY || '',
    },
    dashscope: {
      baseUrl: DASHSCOPE_BASE_URL || '',
      apiKey: DASHSCOPE_API_KEY || '',
    },
    sora2: {
      baseUrl: SORA2_BASE_URL || '',
      apiKey: SORA2_API_KEY || '',
    },
    models: {
      chat: [],
      image: { generation: [], edit: [] },
      video: { generation: [] },
    },
  },
  aliGreen: {
    accessKeyId: ALI_GREEN_ACCESS_KEY_ID || '',
    accessKeySecret: ALI_GREEN_ACCESS_KEY_SECRET || '',
    endpoint: 'green-cip.cn-beijing.aliyuncs.com',
  },
  awsS3: {
    region: 'ap-southeast-1',
    bucketName: 'aitoearn',
    endpoint: 'https://aitoearn.s3.ap-southeast-1.amazonaws.com',
  },
  mailBackHost: process.env.MAIL_BACK_HOST || 'https://dev.aitoearn.ai',
  channelApi: {
    baseUrl: CHANNEL_URL || '',
  },
  moreApi: {
    platApiUri: 'https://platapi.yikart.cn',
    xhsCreatorUri: '',
  },
  statisticsDb: {
    uri: buildStatisticsDbUri(),
    dbName: 'aitoearn_datas',
  },
  auth: {
    secret: JWT_SECRET || 'railway-default-secret',
    internalToken: INTERNAL_TOKEN || '',
  },
  listmonk: {
    host: LISTMONK_HOST || '',
    apiKey: LISTMONK_API_KEY || '',
    apiSecret: LISTMONK_API_SECRET || '',
  },
}
