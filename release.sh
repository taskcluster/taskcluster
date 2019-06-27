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

build() {
    local output=start-worker-${1}-${2}
    GOOS="${1}" GOARCH="${2}" CGO_ENABLED=0 go build -o $output ./cmd/start-worker
    echo $output
}
echo "Building:"
build linux amd64
echo "Attach the above to a new release in GitHub, please"
