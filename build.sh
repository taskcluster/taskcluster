#! /bin/bash

help() {
  echo ""
  echo "Builds log server and deploys it to a docker image."
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

# cd into the directory of this script, in case called from outside...
cd "$(dirname "${0}")"

echo "Building proxy server..."
# Output folder
mkdir -p target
go get ./...
GOARCH=amd64 GOOS=linux go build -o target/livelog .

echo "Building docker image for proxy server"
docker build -t $1 .

