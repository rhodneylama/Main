# Runs Sales Floor anywhere that takes a container — Railway, Render, Fly.io,
# or your own server. Deliberately a single stage: the image is a little larger
# than a multi-stage build, but there is only one place for things to go wrong.

FROM node:20-slim

# better-sqlite3 ships prebuilt binaries for this platform, but keep a compiler
# around so it can build from source if a prebuild is ever missing.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code-only change doesn't reinstall everything.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

# The database and uploaded training files. Mount a persistent volume here or
# everything is wiped on every deploy.
ENV SALESFLOOR_DB_PATH=/data/salesfloor.db
ENV SALESFLOOR_UPLOAD_DIR=/data/uploads
VOLUME ["/data"]

EXPOSE 3000
CMD ["npm", "start"]
