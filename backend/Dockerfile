FROM node:20

RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxkbcommon0 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# --omit=dev: nodemon is the only devDependency and isn't needed at runtime
# (only `npm run dev` uses it). npm ci (not install) for a reproducible,
# lockfile-pinned build.
RUN npm ci --omit=dev

COPY . .

# Run as the non-root user already provided by the base node image, rather
# than root. Puppeteer/Chromium here already launches with --no-sandbox
# (see getBrowser() in controllers/quotationController.js), so it doesn't
# need root privileges for its own sandboxing either way — no behavior
# change to the PDF-generation path from switching this.
RUN chown -R node:node /app
USER node

# Actual runtime port (see .env's PORT / docker-compose.yml's 4000:4000) —
# 5000 here was stale and never matched what the app actually listens on.
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["npm", "start"]