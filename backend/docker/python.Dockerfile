# Judge image for Python — Debian-slim (not Alpine) so GNU /usr/bin/time is available.
FROM python:3.10-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends time \
  && rm -rf /var/lib/apt/lists/*
