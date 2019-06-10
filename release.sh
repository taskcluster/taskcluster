#! /bin/bash

set -e

VERSION="${1}"

if [ -z "$VERSION" ]; then
    echo "USAGE: $0 <version>"
    exit 1
fi

go run util/update-readme.go
sed -i -e "s/Version = .*/Version = \"$VERSION\"/" version.go
git add version.go
git commit -m "v$VERSION"
git tag v$VERSION
