FROM oven/bun:1-alpine

WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY src/ src/

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
