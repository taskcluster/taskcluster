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

NEW_VERSION="${1}"

if [ -z "${NEW_VERSION}" ]; then
  echo "Please specify version of generic-worker to use in gecko try push, e.g. '${0}' 10.4.1" >&2
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

for ARCH in 386 amd64
do
  echo "Waiting for generic-worker ${NEW_VERSION} ($ARCH) to be available on github..."
  DOWNLOAD_URL="https://github.com/taskcluster/generic-worker/releases/download/v${NEW_VERSION}/generic-worker-windows-${ARCH}.exe"
  LOCAL_FILE="generic-worker-windows-${ARCH}-v${NEW_VERSION}.exe"
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
done

# Bug 1460178 - sanity check binary downloads of generic-worker before publishing to tooltool...

if ! file "generic-worker-windows-386-v${NEW_VERSION}.exe" | grep -F 'Intel 80386' | grep -F 'for MS Windows'; then
  echo "Downloaded file doesn't appear to be 386 Windows executable:" >&2
  file "generic-worker-windows-386-v${NEW_VERSION}.exe" >&2
  exit 69
fi

if ! file "generic-worker-windows-amd64-v${NEW_VERSION}.exe" | grep -F 'x86-64' | grep -F 'for MS Windows'; then
  echo "Downloaded file doesn't appear to be amd64 Windows executable:" >&2
  file "generic-worker-windows-amd64-v${NEW_VERSION}.exe" >&2
  exit 70
fi

cat manifest.tt
"${THIS_SCRIPT_DIR}/lib/tooltool.py" upload -v --authentication-file="$(echo ~/.tooltool-upload)" --message "Upgrade *STAGING* worker types to use generic-worker ${NEW_VERSION}"

git clone git@github.com:mozilla-releng/OpenCloudConfig.git
cd OpenCloudConfig/userdata/Manifest
for MANIFEST in *-b.json *-cu.json *-beta.json; do
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  cat "${MANIFEST}.bak" | sed "s_\\(generic-worker/releases/download/v\\)[^/]*\\(/generic-worker-windows-\\)_\\1${NEW_VERSION}\\2_" | sed "s_\\(\"generic-worker \\)[^ ]*\\(.*\\)\$_\\1${NEW_VERSION}\\2_" > "${MANIFEST}"
  cat "${MANIFEST}" > "${MANIFEST}.bak"
  THIS_ARCH="$(cat "${MANIFEST}" | sed -n 's/.*\/generic-worker-windows-\(.*\)\.exe.*/\1/p' | sort -u)"
  if [ "${ARCH}" != "386" ] && [ "${ARCH}" != "amd64" ]; then
    echo "NOOOOOOO - cannot recognise ARCH" >&2
    exit 67
  fi
  SHA512="$(jq --arg filename "generic-worker-windows-${THIS_ARCH}-v${NEW_VERSION}.exe" '.[] | select(.filename == $filename) .digest' ../../../manifest.tt | sed 's/"//g')"
  if [ ${#SHA512} != 128 ]; then
    echo "NOOOOOOO - SHA512 is not 128 bytes: '${SHA512}'" >&2
    exit 68
  fi
  jq --arg sha512 "${SHA512}" --arg componentName GenericWorkerDownload '(.Components[] | select(.ComponentName == $componentName) | .sha512) |= $sha512' "${MANIFEST}.bak" > "${MANIFEST}"
  rm "${MANIFEST}.bak"
done
DEPLOY="deploy: $(git status --porcelain | sed -n 's/^ M userdata\/Manifest\/\(.*\)\.json$/\1/p' | tr '\n' ' ')"
git add .
git commit -m "Testing generic-worker ${NEW_VERSION} on *STAGING*

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
hg commit -m "Testing generic-worker ${NEW_VERSION} on Windows; try: -b do -p win32,win64 -u all -t none"
hg push -f ssh://hg.mozilla.org/try/ -r .

open_browser_page 'https://treeherder.mozilla.org/#/jobs?repo=try'

rm -rf "${CHECKOUT}"

echo "All done!"
