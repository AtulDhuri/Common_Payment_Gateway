// FILE: config/config.module.ts
// PURPOSE: Global provider for the validated, typed AppConfig
// DEPENDENCIES: configuration.ts
// PHASE: 2
import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './configuration';

export const APP_CONFIG = 'APP_CONFIG';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: (): AppConfig => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
