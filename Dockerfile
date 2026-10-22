# Engram web server (API + built web app). Build from the repo root:
#   docker build -t engram .
#   docker run -p 8787:8787 --env-file .env -v engram-data:/data engram
FROM node:24-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

# Install with only the manifests first so the dependency layer caches.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/sdk/package.json packages/sdk/
COPY packages/cli/package.json packages/cli/
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY examples/money-ops/package.json examples/money-ops/
COPY spikes/package.json spikes/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 ENGRAM_DATA=/data
# Read-only demo agent, if it was in the build context.
ENV ENGRAM_DEMO_DIR=/app/demo/money-ops
VOLUME /data
EXPOSE 8787
CMD ["pnpm", "--filter", "@engram/server", "start"]
