const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
      exclude: path.resolve(__dirname, 'src/assets/svgs/plat'),
    })

    config.module.rules.push({
      test: /\.svg$/,
      include: path.resolve(__dirname, 'src/assets/svgs/plat'),
      type: 'asset/resource',
    })

    return config
  },
  reactStrictMode: false,
  output: 'standalone',
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_EVN === 'dev',
  rewrites: async () => {
    const rewrites = [
      {
        source: `${process.env.NEXT_PUBLIC_OSS_URL_PROXY}:path*`,
        destination: `${process.env.NEXT_PUBLIC_OSS_URL}/:path*`,
      },
      {
        source: `${process.env.NEXT_PUBLIC_S3_PROXY}:path*`,
        destination: `${process.env.NEXT_PUBLIC_S3_URL}:path*`,
      },
    ]

    if (process.env.NEXT_PUBLIC_PROXY_URL) {
      rewrites.push({
        source: `/api/:path*`,
        destination: `${process.env.NEXT_PUBLIC_PROXY_URL}/api/:path*`,
      })
    }
    return rewrites
  },
}

const CorsHeaders = [
  { key: 'Access-Control-Allow-Credentials', value: 'true' },
  { key: 'Access-Control-Allow-Origin', value: '*' },
  {
    key: 'Access-Control-Allow-Methods',
    value: '*',
  },
  {
    key: 'Access-Control-Allow-Headers',
    value: '*',
  },
  {
    key: 'Access-Control-Max-Age',
    value: '86400',
  },
]

nextConfig.headers = async () => {
  return [
    {
      source: '/api/:path*',
      headers: CorsHeaders,
    },
  ]
}

module.exports = nextConfig
