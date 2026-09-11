#!/bin/bash

# This script is used to generate releases of the python taskcluster client in
# a uniform way and upload it to pypi.  It should be the only way that releases
# are created.

# Note that the VERSION in pyproject.toml should be updated before release!

REPOSITORY_URL=https://test.pypi.org/legacy/
if [ "$1" = "--real" ]; then
    REPOSITORY_URL=https://upload.pypi.org/legacy/
fi

# step into directory containing this script
cd "$(dirname "${0}")"

# exit in case of bad exit code
set -e

# begin making the distribution
rm -rf dist/
rm -rf build/

# Build and publish using uv
# Install uv if not already available
if ! command -v uv &> /dev/null; then
    echo "uv not found, installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.local/bin/env
fi

# Build the package using uv
uv build

# Publish to PyPI using uv
uv publish --publish-url $REPOSITORY_URL
