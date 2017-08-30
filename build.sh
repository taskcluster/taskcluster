#! /bin/bash

set -e

help() {
  echo ""
  echo "Builds proxy server (For linux) and places into a docker container."
  echo "Docker and Go must be installed and able to compile linux/amd64."
  echo ""
  echo "  Usage: ./build.sh <docker image name>"
  echo ""
}

if [ -z "$1" ] ||
   [ "$1" == "-h" ] ||
   [ "$1" == "--help" ] ;
then
  help
  exit 0
fi

# step into directory of script
cd "$(dirname "${0}")"

uid="$(date +%s)"

# Output folder
mkdir -p target

echo "Generating ca certs using latest ubuntu version..."
docker build --pull -t "${uid}" -f cacerts.docker .
docker run --name "${uid}" "${uid}"
docker cp "${uid}:/etc/ssl/certs/ca-certificates.crt" target
docker rm -v "${uid}"

echo "Building proxy server..."
GOARCH=amd64 GOOS=linux CGO_ENABLED=0 go build -o target/taskcluster-proxy .

echo "Building docker image for proxy server"
docker build -t $1 .
