#! /bin/bash

set -e

VERSION="${1}"

if [ -z "$VERSION" ] || [[ "$VERSION" == v* ]]; then
    echo "USAGE: $0 <version> (without the leading `v`)"
    exit 1
fi

go run util/update-readme.go
if [[ `uname` == 'Darwin' ]]; then
    sed -i '' -e "s/Version = .*/Version = \"$VERSION\"/" version.go
else
    sed -i -e "s/Version = .*/Version = \"$VERSION\"/" version.go
fi
git add version.go README.md
git commit -m "v$VERSION"
git tag v$VERSION

source ./build.sh

echo "* Git push with --follow-tags to the upstream repo"
echo "* Create a new release from the tag"
echo "* Attach the above built binaries to the release"
