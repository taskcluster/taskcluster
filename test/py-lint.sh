#! /bin/sh

python_dirs="taskcluster/src"  # Later we can add #clients/client-py/taskcluster clients/client-py/test" if we make them work the same

flake8 $python_dirs
