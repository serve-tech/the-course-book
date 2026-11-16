# coursebook.golf API image. Build context: the repository root
#   docker build -f apps/api/Dockerfile .
# The runtime stage holds the esbuild bundle, its migrations and, in
# dist/node_modules, only sharp with its prebuilt libvips for musl (photo
# uploads, #67), which build.ts copies there because a native module can't be
# bundled. The build stage is Alpine for that reason: pnpm installs the
# binaries for the platform it runs on. Recipe validated in the P0 spike
# (.planning/research/2026-09-25-api-split-spikes.md); sharp in
# .planning/decisions/2026-11-15-process-course-photos-with-sharp-in-the-api-image.md.
FROM node:24-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /repo

FROM base AS build
# Manifests first so dependency layers survive source-only changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
RUN pnpm fetch
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY tests/e2e/package.json tests/e2e/
RUN pnpm install --offline --frozen-lockfile --filter @coursebook/api...
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN pnpm --filter @coursebook/api build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV CLERK_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
USER node
EXPOSE 3001
CMD ["node", "--enable-source-maps", "dist/main.mjs"]
