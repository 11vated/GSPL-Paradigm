FROM node:20-slim AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/types/ packages/types/
COPY packages/rng/ packages/rng/
COPY packages/events/ packages/events/
COPY packages/seed/ packages/seed/
COPY packages/lang/ packages/lang/
COPY packages/runtime/ packages/runtime/
COPY packages/evolution/ packages/evolution/
COPY packages/store/ packages/store/
COPY packages/forge/ packages/forge/
COPY packages/export/ packages/export/
COPY packages/llm/ packages/llm/
COPY packages/agent/ packages/agent/
COPY packages/awareness/ packages/awareness/
COPY packages/knowledge/ packages/knowledge/
COPY packages/web/ packages/web/

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@paradigm/web

FROM node:20-slim

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/web/dist ./dist
COPY --from=builder /app/packages/web/package.json ./package.json
COPY --from=builder /app/packages/*/dist ./packages/

ENV GSPL_PORT=5001
ENV GSPL_HOST=0.0.0.0
EXPOSE 5001

CMD ["node", "dist/bootstrap.js"]
