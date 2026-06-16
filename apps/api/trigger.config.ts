import { defineConfig } from '@trigger.dev/sdk';
import { caBundleExtension } from './caBundleExtension';
import { prismaExtension } from './customPrismaExtension';
import { emailExtension } from './emailExtension';
import { integrationPlatformExtension } from './integrationPlatformExtension';

export default defineConfig({
  runtime: 'node-22',
  // Self-hosters: create a project at cloud.trigger.dev, set TRIGGER_PROJECT_REF,
  // and use that project's secret keys on Railway (not Comp AI's internal ref).
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_zhioyrusqertqgafqgpj',
  logLevel: 'log',
  maxDuration: 300, // 5 minutes
  build: {
    extensions: [
      caBundleExtension(),
      prismaExtension({
        version: '7.6.0',
        dbPackageVersion: '^2.0.0',
      }),
      integrationPlatformExtension(),
      emailExtension(),
    ],
  },
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
});
