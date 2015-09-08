#!/bin/bash

# This script is used to generate releases of the python taskcluster client in
# a uniform way.  It should be the only way that releases are created.  There
# are two phases, the first is checking that the code is in a clean and working
# state.  The second phase is modifying files, tagging, commiting and pushing
# to pypi

OFFICIAL_GIT_REPO='git@github.com:taskcluster/taskcluster-client.py'

# step into directory containing this script
cd "$(dirname "${0}")"

# exit in case of bad exit code
set -e

# Phase 1: Testing things

# VERSION should have form x.y.z where x, y, z are positive integers
# Note that \(0\|[1-9][0-9]*\) means that the only allowed number to
# begin with 0 is the number 0 itself. All other numbers begin with
# [1-9]. Also this regex requires at least one character, so '' does
# not match.
if ! echo "${VERSION}" | grep -q '^\(0\|[1-9][0-9]*\)\.\(0\|[1-9][0-9]*\)\.\(0\|[1-9][0-9]*\)$'; then
  echo "VERSION = '${VERSION}'"
  echo "Please set it to a release version, of the form x.y.z where x, y, z are positive integers"
  exit 64
fi

# Make sure git tag doesn't already exist on remote
if [ "$(git ls-remote -t "${OFFICIAL_GIT_REPO}" "${VERSION}" 2>&1 | wc -l | tr -d ' ')" != '0' ]; then
  echo "git tag '${VERSION}' already exists remotely on ${OFFICIAL_GIT_REPO},"
  echo "or there was an error checking whether it existed."
  exit 65
fi

# Local changes will not be in the release, so they should be dealt with before
# continuing. git stash can help here! Untracked files can make it into release
# so let's make sure we have none of them either.
modified="$(git status --porcelain)"
if [ -n "$modified" ]; then
  echo "There are changes in the local tree.  This probably means"
  echo "you'll do something unintentional.  For safety's sake, please"
  echo 'revert or stash them!'
  echo
  git status
  exit 66
fi

# Check that the current HEAD is also the tip of the official repo master
# branch. If the commits match, it does not matter what the local branch
# name is, or even if we have a detached head.
remoteMasterSha="$(git ls-remote "${OFFICIAL_GIT_REPO}" master | cut -f1)"
localMasterSha="$(git rev-parse HEAD)"
if [ "${remoteMasterSha}" != "${localMasterSha}" ]; then
  echo "Locally, you are on commit ${localMasterSha}."
  echo "The remote taskcluster repo is on commit ${remoteMasterSha}."
  echo "Make sure to git push/pull so that they both point to the same commit."
  exit 67
fi

# Make sure that build environment is clean
if [ "$(git clean -ndx 2>&1 | wc -l | tr -d ' ')" != 0 ]; then
  echo "You have local changes to files/directories that are in your git ignore list."
  echo "These need to be removed, as they may interfere with the build. Release builds"
  echo "need to be clean builds. To clean your directory, run:"
  echo
  echo "  git -C '$(pwd)' clean -fdx"
  echo
  echo "This will have the following effect:"
  git clean -ndx
  exit 68
fi

set -x

# Make sure dev-env target has been run, and run clean just to be safe too
make clean dev-env

# Test that we can generate Python docs
make docs

# Test that the unit tests and linter work
make

# Phase 2: Modifying and pushing

# Version number
# Avoid sed -i to be mac compatible
tmpFile="$(mktemp -t setup.py.XXXXXXXXXX)"
# copy rather than move, so file permissions are retained in original file
cp setup.py "${tmpFile}"
cat "${tmpFile}" | sed "s,^VERSION=.*$,VERSION='$VERSION',g" > setup.py
rm "${tmpFile}"

# Update the readme file
make update-readme

# files which we're going to make changes to
commitFiles="setup.py"

# We want to commit changes to the README.md file
readmeUpdate=$(git status --porcelain --untracked=no README.md)
if [ -n "$readmeUpdate" ] ; then
  commitFiles="$commitFiles README.md"
fi

# Now, let's commit this change.  We only care to commit
# setup.py because we've already verified that it's the
# only file which is changing
git commit -m "Version $VERSION" $commitFiles
git tag "$VERSION"
git push "${OFFICIAL_GIT_REPO}" "+refs/tags/$VERSION:refs/tags/$VERSION" "+refs/tags/$VERSION:refs/heads/master"
python setup.py sdist
# use twine to upload to protect pypi credentials (python setup.py upload can
# send creds in cleartext)
source env-python/bin/activate
twine upload -s dist/*
