# Purpose: Container build recipe for the WareSwarm Next.js web application.
# Role in the project: Packages the frontend user interface for containerized deployment in Docker environments.
# Key contents: Node.js 20 Alpine base, dependency installation, production build step, port 3000 exposure, and start command.
# Talks to: docker-compose.yml, package.json, next.config.js.

# Use lightweight Node.js 20 Alpine Linux image as the base
FROM node:20-alpine AS base

# Set working directory inside container
WORKDIR /app

# Copy dependency manifests and install packages
COPY package.json ./
RUN npm install

# Copy application source code
COPY . .

# Build production Next.js application bundle
RUN npm run build

# Expose HTTP port 3000 for web traffic
EXPOSE 3000

# Start Next.js production server
CMD ["npm", "start"]
