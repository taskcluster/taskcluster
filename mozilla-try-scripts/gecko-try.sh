#!/bin/bash -exv

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

NEW_GW_VERSION="${1}"
NEW_TP_VERSION="${2}"

if [ -z "${NEW_GW_VERSION}" ] || [ -z "${NEW_TP_VERSION}" ]; then
  echo "Please specify version of generic-worker and taskcluster-proxy to use in gecko try push, e.g. '${0}' 12.0.0 5.1.0" >&2
  exit 64
fi

echo "Checking system dependencies..."
for command in curl jq grep sleep file git hg cat sed rm mktemp python go patch basename; do
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
    echo "Downloaded file doesn't appear to be '${FILETYPE}':" >&2
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

add_github "taskcluster/generic-worker"    "${NEW_GW_VERSION}" "generic-worker-windows-386.exe"      "Intel 80386"
add_github "taskcluster/generic-worker"    "${NEW_GW_VERSION}" "generic-worker-windows-amd64.exe"    "x86-64"
add_github "taskcluster/taskcluster-proxy" "${NEW_TP_VERSION}" "taskcluster-proxy-windows-386.exe"   "Intel 80386"
add_github "taskcluster/taskcluster-proxy" "${NEW_TP_VERSION}" "taskcluster-proxy-windows-amd64.exe" "x86-64"

cat manifest.tt
"${THIS_SCRIPT_DIR}/lib/tooltool.py" upload -v --authentication-file="$(echo ~/.tooltool-upload)" --message "Upgrade *STAGING* worker types to use generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION}"

git clone git@github.com:mozilla-releng/OpenCloudConfig.git
cd OpenCloudConfig/userdata/Manifest
for MANIFEST in *-b.json *-cu.json *-beta.json; do
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  cat "${MANIFEST}.bak" \
    | sed "s_\\(generic-worker/releases/download/v\\)[^/]*\\(/generic-worker-windows-\\)_\\1${NEW_GW_VERSION}\\2_" | sed "s_\\(\"generic-worker \\)[^ ]*\\(.*\\)\$_\\1${NEW_GW_VERSION}\\2_" \
    | sed "s_\\(taskcluster-proxy/releases/download/v\\)[^/]*\\(/taskcluster-proxy-windows-\\)_\\1${NEW_TP_VERSION}\\2_" \
    > "${MANIFEST}"
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  THIS_ARCH="$(cat "${MANIFEST}" | sed -n 's/.*\/generic-worker-windows-\(.*\)\.exe.*/\1/p' | sort -u)"
  if [ "${THIS_ARCH}" != "386" ] && [ "${THIS_ARCH}" != "amd64" ]; then
    echo "NOOOOOOO - cannot recognise ARCH '${THIS_ARCH}'" >&2
    exit 67
  fi
  updateSHA512 "generic-worker-windows-${THIS_ARCH}.exe" "GenericWorkerDownload"
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  updateSHA512 "taskcluster-proxy-windows-${THIS_ARCH}.exe" "TaskClusterProxyDownload"
  rm "${MANIFEST}.bak"
done

DEPLOY="deploy: $(git status --porcelain | sed -n 's/^ M userdata\/Manifest\/\(.*\)\.json$/\1/p' | tr '\n' ' ')"
git add .
git commit -m "Testing generic-worker ${NEW_GW_VERSION} / taskcluster-proxy ${NEW_TP_VERSION} on *STAGING*

This change does _not_ affect any production workers. Commit made with:

    ${0} ${@}

See https://github.com/taskcluster/generic-worker/blob/$(git -C "${THIS_SCRIPT_DIR}" rev-parse HEAD)/$(git -C "${THIS_SCRIPT_DIR}" ls-files --full-name "$(basename "${0}")")" -m "${DEPLOY}"
OCC_COMMIT="$(git rev-parse HEAD)"
git push

open_browser_page 'https://github.com/mozilla-releng/OpenCloudConfig/commits/master'

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

rm -rf "${CHECKOUT}"

echo "All done!"
