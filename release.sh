#!/bin/bash

# This script is used to generate releases of the python taskcluster client in
# a uniform way.  It should be the only way that releases are created.  There
# are two phases, the first is checking that the code is in a clean and working
# state.  The second phase is modifying files, tagging, commiting and pushing
# to pypi

set -e

# Phase 1: Testing things
if [ -z $VERSION ] ; then
  echo "You must specify a version using \$VERSION"
  exit 1
fi

# Local changes will not be in the release, so they should be dealt with before
# continuing.  git stash can help here!
modified="$(git status --porcelain --untracked=no)"
if [ -n "$modified" ] ; then
  echo "There are changes in the local tree.  This probably means"
  echo "you'll do something unintentional.  For safety's sake, please"
  echo "revert or stash them\!"
  exit 1
fi

# This is a check that you're on a local branch called master.  I should
# probably check that you're on a branch that tracks the origin's master branch
# but that might be too much.
branch=$(git branch | grep "^* " | sed "s/^* //")
if [ "$branch" != 'master' ] ; then
  echo "You must create a release off master branch\!"
fi

set -x;

# Test that we can generate Python docs
make docs

# Test that the unit tests and linter work
make

# Phase 2: Modifying and pushing

# Version number
sed -i "s,^VERSION=.*$,VERSION=\'$VERSION\',g" setup.py

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
git push github.com:taskcluster/taskcluster-client.py master "$VERSION"
python setup.py sdist upload
