#!/bin/bash -e

cd "$(dirname "${0}")"
git grep -l 'alpha' | while read file; do
  cp "${file}" "${file}.copy"
  cat "${file}.copy" | sed 's/2\.[0-9][0-9]*\.[0-9][0-9]*alpha[0-9]*/'"${1}"'/g' > "${file}"
  rm "${file}.copy"
  git add "${file}"
done
git commit -m "Version bump to ${1}"
git tag v${1}
git push; git push --tags
