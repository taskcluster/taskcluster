#!/bin/bash -e
cd "$(dirname "${0}")"

echo "Removing..."
rm -v gecko-*/userdata

echo "Generating..."
curl -L 'https://github.com/mozilla-releng/OpenCloudConfig/tree/master/userdata/Manifest' 2>/dev/null | sed -n 's/.*\(gecko[^.]*\)\.json.*/\1/p' | sort -u | xargs -n 1 -P 32 ./transform.sh
