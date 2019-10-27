#!/bin/bash -e

######
# This script allows you to test a new generic-worker Windows release on
# gecko try. It deploys your chosen generic-worker release to a set of
# staging worker types that are created for this purpose, in order not
# to impact other worker types while testing a generic-worker release.
#
# TODO: this should be rewritten as e.g. a go program, to reduce number
# of system dependencies (e.g. bash, curl, jq, grep, sleep, ...).
#
# TODO: alternatively, it could probably be written to run in docker, or
# as a taskcluster task that runs based on some github event.
#
######

function open_browser_page {
  case "$OSTYPE" in
    linux*)
      xdg-open "${1}"
      ;;
    darwin*)
      open "${1}"
      ;;
  esac
}

DEPLOYMENT_ENVIRONMENT=STAGING
MANIFESTS='gecko-t-win10-64-gpu-b.json gecko-t-win7-32-gpu-b.json gecko-t-win10-64-cu.json gecko-t-win7-32-cu.json gecko-1-b-win2012-beta.json gecko-t-win10-64-beta.json gecko-t-win7-32-beta.json'

ORIG_ARGS="${@}"

while getopts ":pb:" opt; do
  case "${opt}" in
    p) DEPLOYMENT_ENVIRONMENT=PRODUCTION
       MANIFESTS='gecko-1-b-win2012.json gecko-2-b-win2012.json gecko-3-b-win2012.json gecko-t-win7-32.json gecko-t-win7-32-gpu.json gecko-t-win10-64.json gecko-t-win10-64-gpu.json gecko-1-b-win2012-xlarge gecko-t-win10-64-gpu-s mpd-1-b-win2012 mpd-3-b-win2012 mpd001-1-b-win2012 mpd001-3-b-win2012'
       ;;
    b) BRANCH="${OPTARG}"
       ;;
  esac
done

shift $((OPTIND-1))

NEW_GW_VERSION="${1}"
NEW_TP_VERSION="${2}"

if [ -z "${NEW_GW_VERSION}" ] || [ -z "${NEW_TP_VERSION}" ]; then
  echo "Please specify version of generic-worker and taskcluster-proxy to use in gecko try push, e.g. '${0}' [[-p] -b BRANCH] 12.0.0 5.1.0" >&2
  exit 64
fi

if [ -z "${BRANCH}" ] && [ "${DEPLOYMENT_ENVIRONMENT}" == "PRODUCTION" ]; then
  echo "${0} requires a branch name (-b BRANCH) when production target is specified (-p)" >&2
  exit 70
fi

# only set default value for BRANCH after checking it wasn't empty for a production deployment
if [ -z "${BRANCH}" ]; then
  BRANCH='master'
fi

echo "Checking system dependencies..."
for command in curl jq grep sleep file git hg cat sed rm mktemp python2 go patch basename tr; do
  if ! which "${command}" >/dev/null; then
    echo -e "  \xE2\x9D\x8C ${command}"
    echo "${0} requires ${command} to be installed and available in your PATH - please fix and rerun" >&2
    exit 65
  else
    echo -e "  \xE2\x9C\x94 ${command}"
  fi
done

if ! [ -f ~/.tooltool-upload ]; then
  echo "${0} requires tooltool authentication file ~/.tooltool-upload to exist for publishing 'visibility internal' generic-worker releases to tooltool; please create this file and try again" >&2
  exit 66
fi

echo "Upgrading ${DEPLOYMENT_ENVIRONMENT} worker types..."

cd "$(dirname "${0}")"
THIS_SCRIPT_DIR="$(pwd)"

CHECKOUT="$(mktemp -d -t generic-worker-gecko-try.XXXXXXXXXX)"
cd "${CHECKOUT}"

function add_github {
  GITHUB_REPO="${1}"
  RELEASE_VERSION="${2}"
  LOCAL_FILE="${3}"
  FILETYPE="${4}"
  echo "Waiting for ${GITHUB_REPO} ${RELEASE_VERSION} (file ${LOCAL_FILE}) to be available on github..."
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/v${RELEASE_VERSION}/${LOCAL_FILE}"
  while ! curl -s -I "${DOWNLOAD_URL}" | head -1 | grep -q '302 Found'; do
    sleep 3
    echo -n '.'
  done
  echo
  while [ "$(curl -L "${DOWNLOAD_URL}" -s -o "${LOCAL_FILE}" -w "%{http_code}")" != "200" ]; do
    echo "Download attempt failed, trying again..."
    sleep 3
  done
  "${THIS_SCRIPT_DIR}/lib/tooltool.py" add --visibility internal "${LOCAL_FILE}"
  # Bug 1460178 - sanity check binary downloads of generic-worker before publishing to tooltool...
  if ! file "${LOCAL_FILE}" | grep -F "${FILETYPE}" | grep -F 'for MS Windows'; then
    echo "Downloaded file '${LOCAL_FILE}' (from dir '$(pwd)') doesn't appear to be '${FILETYPE}':" >&2
    file "${LOCAL_FILE}" >&2
    exit 69
  fi
}

function updateSHA512 {
  LOCAL_FILE="${1}"
  OCC_COMPONENT="${2}"
  SHA512="$(jq --arg filename "${LOCAL_FILE}" '.[] | select(.filename == $filename) .digest' ../../../manifest.tt | sed 's/"//g')"
  if [ ${#SHA512} != 128 ]; then
    echo "NOOOOOOO - SHA512 is not 128 bytes: '${SHA512}'" >&2
    exit 68
  fi
  jq --arg sha512 "${SHA512}" --arg componentName "${OCC_COMPONENT}" '(.Components[] | select(.ComponentName == $componentName) | .sha512) |= $sha512' "${MANIFEST}.bak" > "${MANIFEST}"
}

add_github "taskcluster/generic-worker"    "${NEW_GW_VERSION}" "generic-worker-multiuser-windows-386.exe"   "Intel 80386"
add_github "taskcluster/generic-worker"    "${NEW_GW_VERSION}" "generic-worker-multiuser-windows-amd64.exe" "x86-64"
add_github "taskcluster/taskcluster-proxy" "${NEW_TP_VERSION}" "taskcluster-proxy-windows-386.exe"          "Intel 80386"
add_github "taskcluster/taskcluster-proxy" "${NEW_TP_VERSION}" "taskcluster-proxy-windows-amd64.exe"        "x86-64"

cat manifest.tt
"${THIS_SCRIPT_DIR}/lib/tooltool.py" upload -v --authentication-file="$(echo ~/.tooltool-upload)" --message "Upgrade *${DEPLOYMENT_ENVIRONMENT}* worker types to use generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION}"

git clone git@github.com:mozilla-releng/OpenCloudConfig.git
cd OpenCloudConfig/userdata/Manifest
# create branch if it doesn't exist, or just check it out if it does...
git checkout "${BRANCH}" || git checkout -b "${BRANCH}"
for MANIFEST in ${MANIFESTS}; do
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  cat "${MANIFEST}.bak" \
    | sed "s_\\(generic-worker/releases/download/v\\)[^/]*\\(/generic-worker-multiuser-windows-\\)_\\1${NEW_GW_VERSION}\\2_" | sed "s_\\(\"generic-worker (multiuser engine) \\)[^ ]*\\(.*\\)\$_\\1${NEW_GW_VERSION}\\2_" \
    | sed "s_\\(taskcluster-proxy/releases/download/v\\)[^/]*\\(/taskcluster-proxy-windows-\\)_\\1${NEW_TP_VERSION}\\2_" \
    > "${MANIFEST}"
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  THIS_ARCH="$(cat "${MANIFEST}" | sed -n 's/.*\/generic-worker-multiuser-windows-\(.*\)\.exe.*/\1/p' | sort -u)"
  if [ "${THIS_ARCH}" != "386" ] && [ "${THIS_ARCH}" != "amd64" ]; then
    echo "NOOOOOOO - cannot recognise ARCH '${THIS_ARCH}' of generic-worker binary in manifest '${MANIFEST}' (from dir '$(pwd)')" >&2
    exit 67
  fi
  updateSHA512 "generic-worker-multiuser-windows-${THIS_ARCH}.exe" "GenericWorkerDownload"
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  updateSHA512 "taskcluster-proxy-windows-${THIS_ARCH}.exe" "TaskClusterProxyDownload"
  rm "${MANIFEST}.bak"
done

WORKER_TYPES="$(git status --porcelain | sed -n 's/^ M userdata\/Manifest\/\(.*\)\.json$/\1/p' | tr '\n' ' ')"
DEPLOY="deploy: ${WORKER_TYPES}"
THIS_REV="$(git -C "${THIS_SCRIPT_DIR}" rev-parse HEAD)"
THIS_FILE="$(git -C "${THIS_SCRIPT_DIR}" ls-files --full-name "$(basename "${0}")")"
git add .
if "${BRANCH}" == "master" ]; then
  git -c "commit.gpgsign=false" commit -m "Deploying generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION} to *${DEPLOYMENT_ENVIRONMENT}*.

Commit made with:
    ${0} $(echo ${ORIG_ARGS})

See https://github.com/taskcluster/generic-worker/blob/$THIS_REV/$THIS_FILE" -m "${DEPLOY}"
else
  git -c "commit.gpgsign=false" commit -m "Upgrade to generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION}.
 
This change updates worker types:
  ${WORKER_TYPES}

Commit made with:
    ${0} $(echo ${ORIG_ARGS})

See https://github.com/taskcluster/generic-worker/blob/$THIS_REV/$THIS_FILE"
fi
OCC_COMMIT="$(git rev-parse HEAD)"
git push origin "${BRANCH}"

open_browser_page "https://github.com/mozilla-releng/OpenCloudConfig/commits/${BRANCH}"

if [ "${DEPLOYMENT_ENVIRONMENT}" == "STAGING" ]; then
  if ! [ -d ~/.mozilla-central ]; then
    hg clone https://hg.mozilla.org/mozilla-central ~/.mozilla-central
  fi

  cd ~/.mozilla-central
  hg up -C
  hg purge

  # wait for OCC deployment to complete
  go run "${THIS_SCRIPT_DIR}/waitforOCC.go" "${OCC_COMMIT}"

  hg pull -u -r default
  patch -p1 -i "${THIS_SCRIPT_DIR}/gecko.patch"
  hg commit -m "Testing generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION} on Windows; try: -b do -p win32,win64 -u all -t none"
  hg push -f ssh://hg.mozilla.org/try/ -r .

  open_browser_page 'https://treeherder.mozilla.org/#/jobs?repo=try'
fi

rm -rf "${CHECKOUT}"

echo "All done!"
