#!/bin/bash
build() {
  local dir=$1
  local tag=$2

  docker build -t $tag $dir
  if [ "$?" -ne "0" ];
  then
    echo "Failed building docker image '$tag' in '$dir'."
  fi
}

# cd into parent directory of this script
cd "$(dirname "${0}")"

# Build docker containers used by the docker-worker tests
#build $PWD taskcluster/docker-worker
build $PWD/test/images/test taskcluster/docker-worker-test
build $PWD/test/images/dind-test/ taskcluster/dind-test:v1
