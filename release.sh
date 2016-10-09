#!/bin/bash

# This script is used to generate releases of the generic worker. It should be
# the only way that releases are created. There are two phases, the first is
# checking that the code is in a clean and working state. The second phase is
# modifying files, tagging, commiting and pushing to github.

# exit in case of bad exit code
set -e

OFFICIAL_GIT_REPO='git@github.com:taskcluster/generic-worker'

# step into directory containing this script
cd "$(dirname "${0}")"

NEW_VERSION="${1}"

if [ -z "${1}" ]; then
  echo "Please supply version number for release, e.g. ./release.sh 7.2.0" >&2
  exit 1
fi

OLD_VERSION="$(cat main.go | sed -n 's/^[[:space:]]*version = "\(.*\)"$/\1/p')"

if ! echo "${OLD_VERSION}" | grep -q '^[1-9][0-9]*\.\(0\|[1-9][0-9]*\)\.\(0\|[1-9][0-9]*\)$'; then
  echo "Previous release version '${OLD_VERSION}' not allowed (should be x.y.z where x>=1, y>=0, z>=0 and x,y,z are integers, with no leading zeros) - please fix main.go" >&2
  exit 64
fi

if ! echo "${NEW_VERSION}" | grep -q '^[1-9][0-9]*\.\(0\|[1-9][0-9]*\)\.\(0\|[1-9][0-9]*\)$'; then
  echo "Release version '${NEW_VERSION}' not allowed (should be x.y.z where x>=1, y>=0, z>=0 and x,y,z are integers, with no leading zeros)" >&2
  exit 65
fi

echo "Previous release: ${OLD_VERSION}"
echo "New release:      ${NEW_VERSION}"

if [ "${OLD_VERSION}" == "${NEW_VERSION}" ]; then
  echo "Cannot release since release version specified is the same as the current release number" >&2
  exit 66
fi

function inline_sed {
  tempfile="$(mktemp -t inline_sed.XXXXXX)"
  local file="${1}"
  local exp="${2}"
  cat "${file}" | sed "${2}" > "${tempfile}"
  cat "${tempfile}" > "${file}"
  rm "${tempfile}"
  git add "${file}"
}


# Make sure git tag doesn't already exist on remote
if [ "$(git ls-remote -t "${OFFICIAL_GIT_REPO}" "v${NEW_VERSION}" 2>&1 | wc -l | tr -d ' ')" != '0' ]; then
  echo "git tag '${NEW_VERSION}' already exists remotely on ${OFFICIAL_GIT_REPO},"
  echo "or there was an error checking whether it existed."
  exit 67
fi

# Local changes will not be in the release, so they should be dealt with before
# continuing. git stash can help here! Untracked files can make it into release
# so let's make sure we have none of them either.
modified="$(git status --porcelain)"
if [ -n "$modified" ]; then
  echo "There are changes in the local tree. This probably means"
  echo "you'll do something unintentional. For safety's sake, please"
  echo 'revert or stash them!'
  echo
  git status
  exit 68
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
  exit 69
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
  exit 70
fi

inline_sed README.md "s/.\/release.sh ${OLD_VERSION//./\\.}/.\/release.sh ${NEW_VERSION}/"
inline_sed main.go 's/version = "'"${OLD_VERSION//./\\.}"'"$/version = "'"${NEW_VERSION}"'"/'
find . -name userdata | while read file; do
  inline_sed "${file}" "s:taskcluster/generic-worker/releases/download/v${OLD_VERSION//./\\.}/:taskcluster/generic-worker/releases/download/v${NEW_VERSION}/:g"
done
git commit -m "Version bump from ${OLD_VERSION} to ${NEW_VERSION}"
git tag "v${NEW_VERSION}"
git push "${OFFICIAL_GIT_REPO}" "+refs/tags/v${NEW_VERSION}:refs/tags/v${NEW_VERSION}" "+refs/tags/v${NEW_VERSION}:refs/heads/master"

echo
echo Will you also be deploying this release to production? If so, please run:
echo
echo   ***** ./publish-payload-schema.sh *****
echo
echo This will update:
echo
echo   https://docs.taskcluster.net/manual/execution/workers/generic-worker \!
