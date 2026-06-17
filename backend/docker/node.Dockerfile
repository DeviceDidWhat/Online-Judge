# Judge image for JavaScript — Debian-slim (not Alpine) so GNU /usr/bin/time is available.
FROM node:18-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends time \
  && rm -rf /var/lib/apt/lists/*
