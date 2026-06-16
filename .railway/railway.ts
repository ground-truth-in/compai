/**
 * Railway Infrastructure as Code for Comp AI.
 *
 * Manages service build/deploy config (configFile paths, healthchecks).
 * Secrets, URLs, and bucket wiring live in deploy/railway/set-variables.sh —
 * do NOT put env vars here or `railway config apply` will delete manual variables.
 *
 * Usage:
 *   railway config plan
 *   ./deploy/railway/apply-service-config.sh
 */
import {
  defineRailway,
  github,
  group,
  postgres,
  project,
  service,
} from 'railway/iac';

const compAiProject = defineRailway(() => {
  const db = postgres('Postgres');

  // Storage bucket: create manually (railway bucket create …) and wire APP_AWS_*
  // via set-variables.sh — not managed here to avoid replacing existing buckets.

  const migrator = service('Migrator', {
    source: github('ground-truth-in/compai'),
    configFile: '/deploy/railway/migrator.railway.json',
  });

  const api = service('API', {
    source: github('ground-truth-in/compai'),
    configFile: '/deploy/railway/api.railway.json',
    healthcheck: '/v1/health',
  });

  const app = service('App', {
    source: github('ground-truth-in/compai'),
    configFile: '/deploy/railway/app.railway.json',
    healthcheck: '/api/health',
  });

  const portal = service('Portal', {
    source: github('ground-truth-in/compai'),
    configFile: '/deploy/railway/portal.railway.json',
    healthcheck: '/',
  });

  const backend = group('Backend', [db, migrator, api]);
  const frontends = group('Frontends', [app, portal]);

  return project('Comp AI', {
    resources: [backend, frontends],
  });
});

export default compAiProject;

// tsx/tsImport double-wraps `export default`; Railway's evaluator needs a direct function.
module.exports = compAiProject;
