#!/usr/bin/env bash
# Builds all judge images. Run once (and after editing any *.Dockerfile):
#   bash backend/docker/build.sh
# Requires Docker to be running.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build() {
  echo "Building $1 ..."
  docker build -t "$1" -f "$DIR/$2" "$DIR"
}

build "judge-gcc:13"     "gcc.Dockerfile"
build "judge-python:3.10" "python.Dockerfile"
build "judge-node:18"     "node.Dockerfile"
build "judge-java:17"     "java.Dockerfile"

echo "All judge images built."
