# syntax=docker/dockerfile:1

# The image that runs on the server. It is built on the server too, from the
# exact commit being released, so what runs is what the archive contained and
# nothing else: no laptop leaks into production and no registry is needed.
#
# Four stages. The first three exist only to produce `dist/`; only the last one
# is kept, so the compilers, the test runner and every dev dependency stay out
# of the thing that faces the internet.

# --- base -------------------------------------------------------------------
# One Node version for the whole build. Corepack reads "packageManager" from
# package.json, so the pnpm version is the one the lockfile was written with;
# there is no second place to bump it and no way for the two to drift.
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# --- deps -------------------------------------------------------------------
# Every dependency, dev ones included, because the build needs TypeScript and
# Vite. `pnpm fetch` reads only the lockfile, so this layer is reused across
# releases that did not change dependencies — which is most of them.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --prod=false --offline

# --- build ------------------------------------------------------------------
# `pnpm build` compiles the server to dist/server and the SPA to dist/frontend.
# The two `test -f` lines are the gate: a build script that silently produces
# nothing would otherwise be discovered by the health check after the switch,
# which is minutes later and one restart too late.
FROM deps AS build
RUN pnpm build \
 && test -f dist/server/main.js \
 && test -f dist/frontend/index.html

# --- prod-deps --------------------------------------------------------------
# The runtime dependency tree on its own. Built from the same lockfile rather
# than pruned from the `deps` tree, so what ships is exactly what "dependencies"
# in package.json says and nothing a dev tool dragged in.
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm fetch
RUN pnpm install --frozen-lockfile --prod --offline

# --- runtime ----------------------------------------------------------------
# Plain node:24-slim, not `base`: corepack's pnpm download has no business in
# the running container.
FROM node:24-slim AS runtime
WORKDIR /app

# The commit being released, handed in by deploy/release.mjs. The app puts it in
# every log line and serves it from /health/version, which is how the release
# script proves the container it is looking at is the one it just started.
ARG APP_RELEASE=dev
ENV APP_RELEASE=$APP_RELEASE
ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
# The generated migration SQL. It is read from disk at startup and by the
# migration rehearsal, so it has to be in the image rather than compiled into it.
COPY server/drizzle ./server/drizzle

# Attachments and anything else the app writes live on a named volume mounted
# here. Created with the right owner now, because a volume Docker creates on
# first run inherits the mount point's ownership from the image.
RUN install -d -o node -g node /data
VOLUME ["/data"]

# Not root. A container breakout is a different conversation, but an application
# bug that writes where it should not is an everyday one.
USER node

EXPOSE 3000
CMD ["node", "dist/server/main.js"]
