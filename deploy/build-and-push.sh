#!/bin/bash
set -euo pipefail

IMAGE="localhost:5000/claw-relay:latest"

echo "Building $IMAGE..."
docker build -t "$IMAGE" -f Dockerfile .

echo "Pushing $IMAGE..."
docker push "$IMAGE"

echo "Done. Pushed $IMAGE"
