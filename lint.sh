#!/bin/bash
set -e
# Because some of the python we generate is just a little less than perfect,
# and because it'd be too much work to write it out nicer, we'll just disable
# some less important rules for the generated files
# NOTE: Superduperslow!

flake8=${FLAKE8:-flake8}

all_py=$(find taskcluster test -name "*.py")

norm_to_lint=""
gen_to_lint=""

for file in $all_py ; do
	grep $file filescreated.dat &> /dev/null && /bin/true
	if [ $? -eq 0 ] ; then
    gen_to_lint="$gen_to_lint $file"
	else
    norm_to_lint="$norm_to_lint $file"
	fi
done

echo Linting generated python files
flake8 --ignore=E201,E128 --max-line-length=100000 $gen_to_lint
echo Linting non-generated files
flake8 $norm_to_lint
