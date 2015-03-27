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

echo "Building proxy server..."
# Output folder
mkdir -p target
GOARCH=amd64 GOOS=linux go build -o target/livelog .

echo "Building docker image for proxy server"
docker build -t $1 .

