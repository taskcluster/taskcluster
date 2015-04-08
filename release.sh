#!/bin/bash

set -e

if [ -z $VERSION ] ; then
  echo "You must specify a version using \$VERSION"
  exit 1
fi

modified="$(git status --porcelain --untracked=no)"

if [ -n "$modified" ] ; then
  echo "There are changes in the local tree.  This probably means"
  echo "you'll do something unintentional.  For safety's sake, please"
  echo "revert or stash them\!"
  exit 1
fi

branch=$(git branch | grep "^* " | sed "s/^* //")
if [ "$branch" != 'master' ] ; then
  echo "You must create a release off master branch\!"
fi

set -x;

# Now, let's modify the version number
sed -i "s,^VERSION=.*$,VERSION=\'$VERSION\',g" setup.py

make
# Now, let's commit this change.  We only care to commit
# setup.py because we've already verified that it's the
# only file which is changing
git commit -m "Tagging version $VERSION" setup.py
git tag "$VERSION"
git push github.com:taskcluster/taskcluster-client.py master "$VERSION"
python setup.py sdist upload
