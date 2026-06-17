# Judge image for C / C++ — adds GNU /usr/bin/time for accurate program timing.
FROM gcc:13
RUN apt-get update \
  && apt-get install -y --no-install-recommends time \
  && rm -rf /var/lib/apt/lists/*
