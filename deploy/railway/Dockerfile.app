# Comp AI — App (Next.js). Railway builds the last stage (no --target support).
# Derived from the root Dockerfile `app` target.

FROM oven/bun:1.2.8 AS deps

WORKDIR /app

COPY package.json bun.lock ./
COPY packages/kv/package.json ./packages/kv/
COPY packages/ui/package.json ./packages/ui/
COPY packages/email/package.json ./packages/email/
COPY packages/integration-platform/package.json ./packages/integration-platform/
COPY packages/integrations/package.json ./packages/integrations/
COPY packages/utils/package.json ./packages/utils/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/auth/package.json ./packages/auth/
COPY packages/billing/package.json ./packages/billing/
COPY packages/company/package.json ./packages/company/
COPY packages/db/package.json ./packages/db/
COPY apps/app/package.json ./apps/app/

RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true bun install --ignore-scripts

FROM node:22-bookworm-slim AS app-builder

WORKDIR /app

COPY packages ./packages
COPY apps/app ./apps/app
COPY --from=deps /app/node_modules ./node_modules

RUN cd packages/db && npm run build \
  && cd ../auth && npm run build \
  && cd ../company && npm run build \
  && cd ../billing && npm run build

ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_IS_DUB_ENABLED
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_IS_DUB_ENABLED=$NEXT_PUBLIC_IS_DUB_ENABLED \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_TELEMETRY_DISABLED=1 NODE_ENV=production \
    NEXT_OUTPUT_STANDALONE=true \
    NEXT_BUILD_SINGLE_CPU=1 \
    SKIP_SENTRY_BUILD=true \
    NODE_OPTIONS=--max-old-space-size=4096 \
    PATH="/app/node_modules/.bin:${PATH}"

RUN cd apps/app && SKIP_ENV_VALIDATION=true npm run build:docker

FROM node:22-alpine

WORKDIR /app

COPY --from=app-builder /app/apps/app/.next/standalone ./
COPY --from=app-builder /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=app-builder /app/apps/app/public ./apps/app/public

EXPOSE 3000
CMD ["node", "apps/app/server.js"]
