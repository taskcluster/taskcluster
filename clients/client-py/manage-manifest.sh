#!/bin/bash

# This script can be used to download or deploy the current manifest.json
# file.  This file is used as the canonical source of truth regarding which
# apis that clients should use and the path to the json api reference.
# This script uses the aws command line tool to either fetch or update
# the json file stored

action=$1

case $action in
  fetch)
    echo Downloading manifest.json
    if [ -f manifest.json ] ; then
      echo Local manifest.json already exists, remove it first 1>&2
      exit 1
    fi
    aws s3 cp s3://references.taskcluster.net/manifest.json manifest.json
    echo The manifest.json file is ready for editing
    ;;
  upload)
    echo Uploading manifest.json
    if [ ! -f manifest.json ] ; then
      echo Local manifest.json does not exist, cannot proceed 1>&2
      exit 1
    fi
    aws s3 cp manifest.json s3://references.taskcluster.net/manifest.json
    echo New manifest.json file deployed
    ;;
esac

