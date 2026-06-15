/**
 * Railway Infrastructure as Code for Comp AI.
 *
 * Managed by the Railway CLI — types come from `railway/iac` at plan/apply time.
 * Docs: https://docs.railway.com/infrastructure-as-code
 *
 * Usage:
 *   railway link
 *   railway config plan
 *   railway config apply
 */
import {
  defineRailway,
  bucket,
  github,
  group,
  postgres,
  preserve,
  project,
  service,
} from 'railway/iac';

/** Map Railway bucket credentials to Comp AI's APP_AWS_* env vars. */
function compAiS3Env(storage: ReturnType<typeof bucket>) {
  const bucketName = storage.env.BUCKET;

  return {
    APP_AWS_ACCESS_KEY_ID: storage.env.ACCESS_KEY_ID,
    APP_AWS_SECRET_ACCESS_KEY: storage.env.SECRET_ACCESS_KEY,
    APP_AWS_REGION: storage.env.REGION,
    APP_AWS_ENDPOINT: storage.env.ENDPOINT,
    APP_AWS_BUCKET_NAME: bucketName,
    APP_AWS_ORG_ASSETS_BUCKET: bucketName,
    APP_AWS_QUESTIONNAIRE_UPLOAD_BUCKET: bucketName,
    APP_AWS_KNOWLEDGE_BASE_BUCKET: bucketName,
  };
}

export default defineRailway(() => {
  const db = postgres('Postgres');
  const storage = bucket('Storage', { region: 'iad' });
  const s3 = compAiS3Env(storage);

  const migrator = service('Migrator', {
    source: github('ground-truth-in/compai'),
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
    },
  });

  const api = service('API', {
    source: github('ground-truth-in/compai'),
    healthcheck: '/v1/health',
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      ...s3,
      BASE_URL: preserve(),
      SECRET_KEY: preserve(),
      BETTER_AUTH_URL: preserve(),
      AUTH_TRUSTED_ORIGINS: preserve(),
      RESEND_API_KEY: preserve(),
      BREVO_API_KEY: preserve(),
      EMAIL_PROVIDER: preserve(),
      SERVICE_TOKEN_TRIGGER: preserve(),
      SERVICE_TOKEN_PORTAL: preserve(),
      INTERNAL_API_TOKEN: preserve(),
      TRIGGER_SECRET_KEY: preserve(),
      OPENAI_API_KEY: preserve(),
      UPSTASH_REDIS_REST_URL: preserve(),
      UPSTASH_REDIS_REST_TOKEN: preserve(),
    },
  });

  const app = service('App', {
    source: github('ground-truth-in/compai'),
    healthcheck: '/api/health',
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      ...s3,
      AUTH_SECRET: preserve(),
      SECRET_KEY: preserve(),
      BETTER_AUTH_URL: preserve(),
      NEXT_PUBLIC_BETTER_AUTH_URL: preserve(),
      NEXT_PUBLIC_API_URL: preserve(),
      NEXT_PUBLIC_PORTAL_URL: preserve(),
      RESEND_API_KEY: preserve(),
      BREVO_API_KEY: preserve(),
      EMAIL_PROVIDER: preserve(),
      TRIGGER_SECRET_KEY: preserve(),
      REVALIDATION_SECRET: preserve(),
      INTERNAL_API_TOKEN: preserve(),
      SERVICE_TOKEN_TRIGGER: preserve(),
      OPENAI_API_KEY: preserve(),
    },
  });

  const portal = service('Portal', {
    source: github('ground-truth-in/compai'),
    healthcheck: '/',
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      ...s3,
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      NEXT_PUBLIC_BETTER_AUTH_URL: preserve(),
      NEXT_PUBLIC_API_URL: preserve(),
      RESEND_API_KEY: preserve(),
      BREVO_API_KEY: preserve(),
      EMAIL_PROVIDER: preserve(),
      INTERNAL_API_TOKEN: preserve(),
    },
  });

  const backend = group('Backend', [db, storage, migrator, api]);
  const frontends = group('Frontends', [app, portal]);

  return project('Comp AI', {
    resources: [backend, frontends],
  });
});
