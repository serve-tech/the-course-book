# Production image for coursebook.golf. Four stages keep dev dependencies out
# of the runtime layer; the final stage carries only the server bundle, the
# production node_modules, and what the pre-deploy migration needs.
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@12.5.1 --activate

FROM base AS development-dependencies-env
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies-env
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
WORKDIR /app
RUN pnpm install --frozen-lockfile --prod

FROM base AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN pnpm build

FROM base
ENV NODE_ENV=production
ENV CLERK_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY app/db/migrate.ts /app/app/db/migrate.ts
COPY app/db/migrations /app/app/db/migrations
WORKDIR /app
EXPOSE 3000
CMD ["node", "node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]
