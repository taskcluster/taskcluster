#! /bin/bash

set -e

VERSION="${1}"

if [ -z "$VERSION" ]; then
    echo "USAGE: $0 <version>"
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

build() {
    local output=start-worker-${1}-${2}
    GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -o $output ./cmd/start-worker
    echo $output
}
echo "Building:"
build linux amd64
echo "* Git push with --follow-tags to the upstream repo"
echo "* Create a new release from the tag"
echo "* Attach the above built binary to the release"
