#!/bin/bash
set -e
# Lint using ruff
# Note: Generated files have special rules applied

echo "Running ruff check..."
uv run ruff check taskcluster test

echo "Running ruff format check..."
uv run ruff format --check taskcluster test

echo "Linting complete!"
