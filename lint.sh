#!/bin/bash
set -e
# Because some of the python we generate is just a little less than perfect,
# and because it'd be too much work to write it out nicer, we'll just disable
# some less important rules for the generated files
# NOTE: Superduperslow!

flake8=${FLAKE8:-flake8}

all_py=$(find taskcluster test -name "*.py")
gen_py=$(cat filescreated.dat)

for file in $all_py ; do
	grep file $gen_py &> /dev/null
	echo Linting $file
	if [ $? -eq 0 ] ; then
		flake8 --ignore=E201,E128 --max-line-length=100000 $file
	else
		flake8 $file
	fi
done
