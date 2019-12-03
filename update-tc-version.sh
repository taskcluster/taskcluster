#! /bin/sh

old=$1
new=$2

if [ -z "$new" ]; then
	echo "USAGE: ./update-tc-version.sh v<old> v<new>"
	exit 1
fi

sed -i -e 's!client-go/'$old'!client-go/'$new'!' $(git grep client-go/$old | grep -v go.sum | cut -d: -f 1 | sort -u )
