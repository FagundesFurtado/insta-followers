# Stage 1: install Node.js dependencies
FROM node:20-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: build the Next.js application
FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: production runtime with cron-enabled Python environment
FROM node:20-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install Python and cron, then clean up apt caches to keep the image smaller
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv cron \
    && rm -rf /var/lib/apt/lists/*

# Install production Node.js dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the build output and runtime assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install Python dependencies for the updater script
COPY requirements.txt ./requirements.txt
RUN python3 -m venv /opt/pyenv \
    && /opt/pyenv/bin/pip install --no-cache-dir -r requirements.txt

ENV PATH="/opt/pyenv/bin:${PATH}"

# Configure cron with the scheduled job
COPY docker/cron/update_followers /etc/cron.d/update_followers
RUN chmod 0644 /etc/cron.d/update_followers \
    && crontab /etc/cron.d/update_followers

# Provide the entrypoint that starts cron and the Next.js server
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 3000

CMD ["/usr/local/bin/entrypoint.sh"]
