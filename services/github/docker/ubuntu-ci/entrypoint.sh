#!/bin/bash
export PATH=$PATH:~/bin
source $(which virtualenvwrapper.sh)

# Let's always run inside of a virtualenv
if [ ! -d ~/.virtualenvs/worker ]; then
    mkvirtualenv worker
fi
workon worker

$@
