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
  APP_ENV = 'production',
  APP_NAME = 'aitoearn-channel',
  APP_DOMAIN,
} = process.env

const {
  SERVER_URL,
} = process.env

const {
  FEISHU_WEBHOOK_URL,
  FEISHU_WEBHOOK_SECRET,
} = process.env

const {
  BILIBILI_CLIENT_ID,
  BILIBILI_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  KWAI_CLIENT_ID,
  KWAI_CLIENT_SECRET,
  PINTEREST_CLIENT_ID,
  PINTEREST_CLIENT_SECRET,
  PINTEREST_TEST_AUTHORIZATION,
  TIKTOK_CLIENT_ID,
  TIKTOK_CLIENT_SECRET,
  TWITTER_CLIENT_ID,
  TWITTER_CLIENT_SECRET,
  FACEBOOK_CLIENT_ID,
  FACEBOOK_CLIENT_SECRET,
  FACEBOOK_CONFIG_ID,
  THREADS_CLIENT_ID,
  THREADS_CLIENT_SECRET,
  INSTAGRAM_CLIENT_ID,
  INSTAGRAM_CLIENT_SECRET,
  LINKEDIN_CLIENT_ID,
  LINKEDIN_CLIENT_SECRET,
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  WXPLAT_APP_ID,
  WXPLAT_APP_SECRET,
  WXPLAT_ENCODING_AES_KEY,
} = process.env

const {
  ALI_GREEN_ACCESS_KEY_ID,
  ALI_GREEN_ACCESS_KEY_SECRET,
} = process.env

// Build MongoDB URI: prefer MONGODB_URL (Railway provides this), fallback to individual parts
function buildMongoUri() {
  if (MONGODB_URL) return MONGODB_URL
  if (MONGODB_USERNAME && MONGODB_PASSWORD) {
    return `mongodb://${MONGODB_USERNAME}:${encodeURIComponent(MONGODB_PASSWORD)}@${MONGODB_HOST}:${MONGODB_PORT}/?authSource=admin&directConnection=true`
  }
  return `mongodb://${MONGODB_HOST || 'localhost'}:${MONGODB_PORT || 27017}`
}

module.exports = {
  port: Number(process.env.PORT) || 7001,
  env: 'production',
  enableBadRequestDetails: true,
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
  },
  redis: {
    host: REDIS_HOST || 'localhost',
    port: Number(REDIS_PORT) || 6379,
    db: 1,
    password: REDIS_PASSWORD || undefined,
  },
  mongodb: {
    uri: buildMongoUri(),
    dbName: 'aitoearn_channel',
  },
  awsS3: {
    region: 'ap-southeast-1',
    bucketName: 'aitoearn',
    endpoint: 'https://aitoearn.s3.ap-southeast-1.amazonaws.com',
  },
  bilibili: {
    id: BILIBILI_CLIENT_ID || '',
    secret: BILIBILI_CLIENT_SECRET || '',
    authBackHost: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/bilibili/auth/back` : '',
  },
  google: {
    id: GOOGLE_CLIENT_ID || '',
    secret: GOOGLE_CLIENT_SECRET || '',
    authBackHost: '',
  },
  kwai: {
    id: KWAI_CLIENT_ID || '',
    secret: KWAI_CLIENT_SECRET || '',
    authBackHost: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/kwai/auth/back` : '',
  },
  pinterest: {
    id: PINTEREST_CLIENT_ID || '',
    secret: PINTEREST_CLIENT_SECRET || '',
    authBackHost: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/pinterest/authWebhook` : '',
    baseUrl: 'https://api.pinterest.com',
    test_authorization: PINTEREST_TEST_AUTHORIZATION || '',
  },
  tiktok: {
    clientId: TIKTOK_CLIENT_ID || '',
    clientSecret: TIKTOK_CLIENT_SECRET || '',
    redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/tiktok/auth/back` : '',
    scopes: [
      'user.info.basic',
      'user.info.profile',
      'video.upload',
      'video.publish',
    ],
  },
  twitter: {
    clientId: TWITTER_CLIENT_ID || '',
    clientSecret: TWITTER_CLIENT_SECRET || '',
    redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/twitter/auth/back` : '',
  },
  oauth: {
    facebook: {
      clientId: FACEBOOK_CLIENT_ID || '',
      clientSecret: FACEBOOK_CLIENT_SECRET || '',
      configId: FACEBOOK_CONFIG_ID || '',
      redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/meta/auth/back` : '',
      scopes: [
        'public_profile',
        'pages_show_list',
        'pages_manage_posts',
        'pages_read_engagement',
        'pages_read_user_content',
        'pages_manage_engagement',
        'read_insights',
      ],
    },
    threads: {
      clientId: THREADS_CLIENT_ID || '',
      clientSecret: THREADS_CLIENT_SECRET || '',
      redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/meta/auth/back` : '',
      scopes: [
        'threads_basic',
        'threads_content_publish',
        'threads_read_replies',
        'threads_manage_replies',
        'threads_manage_insights',
        'threads_location_tagging',
      ],
    },
    instagram: {
      clientId: INSTAGRAM_CLIENT_ID || '',
      clientSecret: INSTAGRAM_CLIENT_SECRET || '',
      redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/meta/auth/back` : '',
      scopes: [
        'instagram_business_basic',
        'instagram_business_manage_comments',
        'instagram_business_content_publish',
      ],
    },
    linkedin: {
      clientId: LINKEDIN_CLIENT_ID || '',
      clientSecret: LINKEDIN_CLIENT_SECRET || '',
      redirectUri: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/meta/auth/back` : '',
      scopes: ['openid', 'profile', 'email', 'w_member_social'],
    },
  },
  wxPlat: {
    id: WXPLAT_APP_ID || '',
    secret: WXPLAT_APP_SECRET || '',
    token: 'aitoearn',
    encodingAESKey: WXPLAT_ENCODING_AES_KEY || '',
    authBackHost: APP_DOMAIN ? `https://${APP_DOMAIN}/platcallback` : '',
  },
  myWxPlat: {
    id: 'dev',
    secret: 'f1a36f23d027c969d6c6969423d72eda',
    hostUrl: APP_DOMAIN ? `https://wxplat.${APP_DOMAIN}` : '',
  },
  youtube: {
    id: YOUTUBE_CLIENT_ID || '',
    secret: YOUTUBE_CLIENT_SECRET || '',
    authBackHost: APP_DOMAIN ? `https://${APP_DOMAIN}/api/plat/youtube/auth/callback` : '',
  },
  aliGreen: {
    accessKeyId: ALI_GREEN_ACCESS_KEY_ID || '',
    accessKeySecret: ALI_GREEN_ACCESS_KEY_SECRET || '',
    endpoint: 'green-cip.cn-beijing.aliyuncs.com',
  },
  server: {
    baseUrl: SERVER_URL || '',
  },
}

// AI Services Configuration
const aiServicesLoader = require('./ai-services-loader');
aiServicesLoader.enableHotReload();

module.exports.aiServices = aiServicesLoader;
