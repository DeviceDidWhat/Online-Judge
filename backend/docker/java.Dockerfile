# Judge image for Java — adds GNU /usr/bin/time for accurate program timing.
FROM eclipse-temurin:17
RUN apt-get update \
  && apt-get install -y --no-install-recommends time \
  && rm -rf /var/lib/apt/lists/*
