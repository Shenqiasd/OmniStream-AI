import { join } from 'node:path'
import { startApplication } from '@yikart/common'
import { AppModule } from './app.module'
import { config } from './config'
import { isLocalMediaStorageEnabled, resolveLocalMediaRoot } from './file/storage/local-media.service'

startApplication(AppModule, config, {
  setupApp: (app) => {
    app.enableCors()

    app.setViewEngine('ejs')
    app.setBaseViewsDir(join(__dirname, 'views'))
    app.useStaticAssets(join(__dirname, 'public'))
    if (isLocalMediaStorageEnabled()) {
      app.useStaticAssets(resolveLocalMediaRoot(), { prefix: '/media/' })
    }
  },
})
