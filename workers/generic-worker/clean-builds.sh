#!/bin/bash -exv

###### This is a script to be used if travis is not able to publish releases #######
###### (e.g. which happened for generic worker release 6.0.7)                #######

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This only currently runs on darwin" >&2
  exit 64
fi

if [ -z "${TASKCLUSTER_CLIENT_ID}" ] || [ -z "${TASKCLUSTER_ACCESS_TOKEN}" ]; then
  echo "You need to set taskcluster credentials in order to release, as tests need to run" >&2
  exit 65
fi

cd "$(dirname "${0}")"
rm -rf target
mkdir target

export GO_DOWNLOAD_DIR="$(mktemp -d -t go_download.XXXXXXXXXX)"

if [ -f ~/go.tar.gz ] && shasum -a 256 ~/go.tar.gz | grep -q 8436f846b49c2b14a96d90eef6b2a6e0a0e1943bbb767299c1ecabb795b042b9; then
    cp ~/go.tar.gz target/go.tar.gz
else
  ####################################################################
  # The next line is automatically edited by
  #   infrastructure/tooling/src/generate/generators/go-version.js
  #
  # DO NOT CHANGE HERE!
  ####################################################################
  curl -o target/go.tar.gz -L https://storage.googleapis.com/golang/go1.17.6.darwin-amd64.tar.gz
fi

tar -C "${GO_DOWNLOAD_DIR}" -xf target/go.tar.gz
export GOROOT="${GO_DOWNLOAD_DIR}/go"
export PATH="${GOROOT}/bin:${PATH}"
export GOOS="${MY_GOOS}"
export GOARCH="${MY_GOARCH}"
go version
go env
export GOPATH="$(mktemp -d -t generic-worker.XXXXXXXXXX)"
export PATH="${GOPATH}/bin:${PATH}"
rm -rf "${GOPATH}"
go get -d -v 'github.com/taskcluster/generic-worker'
"${GOPATH}/src/github.com/taskcluster/generic-worker/build.sh" -a -t

mv "${GOPATH}/bin/darwin_arm64/generic-worker" target/generic-worker-darwin-arm64
mv "${GOPATH}/bin/darwin_386/generic-worker" target/generic-worker-darwin-386
mv "${GOPATH}/bin/generic-worker" target/generic-worker-darwin-amd64
mv "${GOPATH}/bin/linux_386/generic-worker" target/generic-worker-linux-386
mv "${GOPATH}/bin/linux_amd64/generic-worker" target/generic-worker-linux-amd64
mv "${GOPATH}/bin/linux_arm/generic-worker" target/generic-worker-linux-arm
mv "${GOPATH}/bin/linux_arm64/generic-worker" target/generic-worker-linux-arm64
mv "${GOPATH}/bin/windows_386/generic-worker.exe" target/generic-worker-windows-386
mv "${GOPATH}/bin/windows_amd64/generic-worker.exe" target/generic-worker-windows-amd64

echo
echo "Release binaries available in directory '$(pwd)/target'"
echo

ls -ltr "$(pwd)/target"
echo
echo

rm -rf "${GO_DOWNLOAD_DIR}"
rm -rf "${GOPATH}"
rm target/go.tar.gz
