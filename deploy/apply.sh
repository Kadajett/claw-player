#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Applying k8s manifests..."
kubectl apply -f "$SCRIPT_DIR/k8s/config.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/redis.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/relay.yaml"
kubectl apply -f "$SCRIPT_DIR/k8s/services.yaml"

echo "Restarting relay deployment..."
kubectl rollout restart deployment/claw-relay -n openclaw

echo "Waiting for rollout..."
kubectl rollout status deployment/claw-relay -n openclaw --timeout=120s

echo "Done. Current pods:"
kubectl get pods -n openclaw
