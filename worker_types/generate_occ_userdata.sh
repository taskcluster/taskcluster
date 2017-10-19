#!/bin/bash -e
cd "$(dirname "${0}")"

echo "Removing..."
rm -v gecko-*/userdata

echo "Generating..."
curl -L 'https://github.com/mozilla-releng/OpenCloudConfig/tree/master/userdata/Manifest' 2>/dev/null | sed -n 's/.*\(gecko[^.]*\)\.json.*/\1/p' | sort -u | while read m
do
  echo "${m}"
  mkdir -p "${m}"
  go run transform-occ/main.go "${m}" > "${m}/userdata" || rm "${m}/userdata"
done
