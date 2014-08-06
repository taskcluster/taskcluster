#! /bin/bash
build() {
  local dir=$1
  local tag=$2

  docker build -t $tag $dir
  if [ "$?" -ne "0" ];
  then
    echo "Failed building docker image '$tag' in '$dir'."
  fi
}

# Build docker containers used by the docker-worker tests
build $PWD taskcluster/docker-worker
build $PWD/test/images/test taskcluster/docker-worker-test
