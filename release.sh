#! /bin/bash

set -e

VERSION="${1}"

if [ -z "$VERSION" ]; then
    echo "USAGE: $0 <version>"
    exit 1
fi

git tag v$VERSION

echo "Building:"
docker build -t taskcluster/websocktunnel:$VERSION .

echo "* Git push with --follow-tags to the upstream repo"
echo "* Docker push taskcluster/websocktunnel:$VERSION"
echo "* Create a new release from the tag briefly describing the changes"
