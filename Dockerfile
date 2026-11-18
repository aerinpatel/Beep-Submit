FROM node:22-alpine AS base

# Install dependencies required for building native packages if any
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm

WORKDIR /app

# Install dependencies based on lockfile and pnpm workspace settings
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Expose Next.js default port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default command runs database migrations then starts dev server
CMD ["sh", "-c", "pnpm db:migrate && pnpm dev"]
