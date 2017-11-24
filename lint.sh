#!/bin/bash
set -e
# Because some of the python we generate is just a little less than perfect,
# and because it'd be too much work to write it out nicer, we'll just disable
# some less important rules for the generated files
# NOTE: Superduperslow!

while [ $# -ne 0 ] ; do
  case "$1" in 
    --flake8)
      flake8=$2
      shift 2;;
    --python)
      python=$2
      shift 2 ;;
    *)
      echo "Unknown command argument" >&2
      exit 1
      ;;
  esac
done

flake8=${flake8:-$FLAKE8}
python=${python:-$PYTHON}

all_py=$(find taskcluster test -name "*.py")

norm_to_lint=""
gen_to_lint=""

for file in $all_py ; do
  grep $file filescreated.dat &> /dev/null && $(which true)
	if [ $? -eq 0 ] ; then
    gen_to_lint="$gen_to_lint $file"
	else
    norm_to_lint="$norm_to_lint $file"
	fi
done

case "$($python -c 'import sys ; print(sys.version_info.major)')" in
  2)
    ignore_async="--exclude=*/async/*,*_async.py"
    ;;
  *)
    ignore_async=""
    ;;
esac

echo Python: $python
echo Flake8: $flake8

$python --version &> /dev/null
$flake8 --version &> /dev/null

echo Linting generated python files
$flake8 --ignore=E201,E128 --max-line-length=100000 $ignore_async $gen_to_lint && true
gen_result=${PIPESTATUS[0]}
echo Linting non-generated files
$flake8 --max-line-length=120 $ignore_async $norm_to_lint
exit $(( $? + $gen_result))
