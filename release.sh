#!/bin/bash

# This script is used to generate releases of the taskcluster proxy. It should be
# the only way that releases are created. There are two phases, the first is
# checking that the code is in a clean and working state. The second phase is
# modifying files, tagging, commiting and pushing to github.

# exit in case of bad exit code
set -e

OFFICIAL_GIT_REPO='git@github.com:taskcluster/taskcluster-proxy'

# step into directory containing this script
cd "$(dirname "${0}")"

NEW_VERSION="${1}"

if [ -z "${1}" ]; then
  echo "Please supply version number for release, e.g. ./release.sh 4.0.6" >&2
  exit 1
fi

OLD_VERSION="$(cat main.go | sed -n 's/^[[:space:]]*version *= *"\(.*\)"$/\1/p')"

VALID_FORMAT='^[1-9][0-9]*\.\(0\|[1-9][0-9]*\)\.\(0\|[1-9]\)\([0-9]*alpha[1-9][0-9]*\|[0-9]*\)$'
FORMAT_EXPLANATION='should be "<a>.<b>.<c>" OR "<a>.<b>.<c>alpha<d>" where a>=1, b>=0, c>=0, d>=1 and a,b,c,d are integers, with no leading zeros'

if ! echo "${OLD_VERSION}" | grep -q "${VALID_FORMAT}"; then
  echo "Previous release version '${OLD_VERSION}' not allowed (${FORMAT_EXPLANATION}) - please fix main.go" >&2
  exit 64
fi

if ! echo "${NEW_VERSION}" | grep -q "${VALID_FORMAT}"; then
  echo "Release version '${NEW_VERSION}' not allowed (${FORMAT_EXPLANATION})" >&2
  exit 65
fi

echo "Previous release: ${OLD_VERSION}"
echo "New release:      ${NEW_VERSION}"

if [ "${OLD_VERSION}" == "${NEW_VERSION}" ]; then
  echo "Cannot release since release version specified is the same as the current release number" >&2
  exit 66
fi

# The format of the sed -i option is slightly different on macOS and linux
# and therefore this is a platform independent implementation, *sigh*
# GNU sed: -i[SUFFIX], --in-place[=SUFFIX]
# BSD sed: -i extension
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

# ******** If making a NON-alpha release only **********
# Check that the current HEAD is also the tip of the official repo master
# branch. If the commits match, it does not matter what the local branch
# name is, or even if we have a detached head.
if ! echo "${NEW_VERSION}" | grep -q "alpha"; then
  remoteMasterSha="$(git ls-remote "${OFFICIAL_GIT_REPO}" master | cut -f1)"
  localSha="$(git rev-parse HEAD)"
  if [ "${remoteMasterSha}" != "${localSha}" ]; then
    echo "Locally, you are on commit ${localSha}."
    echo "The remote taskcluster repo master branch is on commit ${remoteMasterSha}."
    echo "Make sure to git push/pull so that they both point to the same commit."
    exit 69
  fi
fi

inline_sed main.go 's/\(version *= *\)"'"${OLD_VERSION//./\\.}"'"$/\1"'"${NEW_VERSION}"'"/'
git commit -m "Version bump from ${OLD_VERSION} to ${NEW_VERSION}"
git tag -s "v${NEW_VERSION}" -m "Making release ${NEW_VERSION}"
# only ensure master is updated if it is a non-alpha release
if ! echo "${NEW_VERSION}" | grep -q "alpha"; then
  git push "${OFFICIAL_GIT_REPO}" "+HEAD:refs/heads/master"
  git fetch --all
fi
git push "${OFFICIAL_GIT_REPO}" "+refs/tags/v${NEW_VERSION}:refs/tags/v${NEW_VERSION}"

echo "Now waiting for travis to push release to github..."

while ! curl -s -I "https://github.com/taskcluster/taskcluster-proxy/releases/download/v${NEW_VERSION}/taskcluster-proxy-linux-amd64" | head -1 | grep -q '302 Found'; do
  sleep 3
  echo -n '.'
done
echo
echo "======================================================================================================
echo "The github release of taskcluster-proxy ${NEW_VERSION} has been published to:"
echo "  * https://github.com/taskcluster/taskcluster-proxy/releases"
echo "======================================================================================================
echo

uid="$(date +%s)"

# Output folder
mkdir -p target

echo "Generating ca certs using latest ubuntu version..."
docker build --pull -t "${uid}" -f cacerts.docker .
docker run --name "${uid}" "${uid}"
docker cp "${uid}:/etc/ssl/certs/ca-certificates.crt" target
docker rm -v "${uid}"

echo "Downloading proxy server release from github..."
curl -s -L "https://github.com/taskcluster/taskcluster-proxy/releases/download/v${NEW_VERSION}/taskcluster-proxy-linux-amd64" > target/taskcluster-proxy
chmod a+x target/taskcluster-proxy

echo "Building docker image for proxy server"
docker build -t "taskcluster/taskcluster-proxy:${NEW_VERSION}" .
docker tag "taskcluster/taskcluster-proxy:${NEW_VERSION}" "taskcluster/taskcluster-proxy:latest"
docker push "taskcluster/taskcluster-proxy:${NEW_VERSION}"
docker push "taskcluster/taskcluster-proxy:latest"
echo
echo
echo "======================================================================================================
echo "The docker image for taskcluster-proxy ${NEW_VERSION} has been published to:"
echo "  * https://hub.docker.com/r/taskcluster/taskcluster-proxy/tags/"
echo "======================================================================================================
echo
echo "It is HIGHLY RECOMMENDED to test the new docker-worker release before using it:"
echo "  * https://github.com/taskcluster/taskcluster-proxy/tree/v${NEW_VERSION}#testing-your-locally-built-docker-container"
