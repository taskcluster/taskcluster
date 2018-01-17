#!/bin/bash -e

echo "Releasing docker-worker on Github"

if [ "$DOCKER_WORKER_GITHUB_TOKEN" == "" ]; then
  echo "You need to define the environment variable DOCKER_WORKER_GITHUB_TOKEN" >&2
  echo "with a valid Github personal token." >&2
  echo "If you intended to only deploy AMIs, then run the deploy.sh script." >&2
  exit 1
fi

remote=$(git remote -v | grep 'taskcluster/docker-worker' | head -1 | awk '{print $1}')
if [ "$remote" == "" ]; then
  git remote add tcdw git@github.com/taskcluster/docker-worker
  remote=tcdw
fi

git fetch $remote

branch=$(git rev-parse --abbrev-ref HEAD)
current_branch_head_sha=$(git rev-parse $branch)
remote_branch_head_sha=$(git rev-parse $remote/$branch)

if [ "$current_branch_head_sha" != "$remote_branch_head_sha" ]; then
  echo "$branch and $remote/$branch mismatch!" >&2
  exit 1
fi

release_name=$(deploy/bin/github-release.js)
echo "$release_name has been released at https://github.com/taskcluster/docker-worker/releases/tag/$release_name"
