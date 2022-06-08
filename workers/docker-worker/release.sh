#!/bin/bash

set -ex

OUTPUT=docker-worker-x64.tgz
while getopts "o:" opt; do
    case "${opt}" in
        o)  OUTPUT=$OPTARG
            ;;
    esac
done

DW_ROOT=$(mktemp -d)
trap "rm -rf $DW_ROOT" EXIT

# create an easy-to-use thing that will find the right paths, etc.
mkdir -p $DW_ROOT/bin
cat > $DW_ROOT/bin/docker-worker <<'EOF'
#!/bin/bash
DW_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
NODE=$DW_ROOT/node/bin/node
exec $NODE $DW_ROOT/src/main.js "${@}"
EOF
chmod +x $DW_ROOT/bin/docker-worker

# install docker-worker itself
for f in src schemas .npmignore package.json yarn.lock config.yml bin-utils; do
    cp -r $PWD/$f $DW_ROOT
done

# Install Node
NODE_VERSION=$(echo "console.log(require('./package.json').engines.node)" | node)
mkdir $DW_ROOT/node
curl https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz | tar -C $DW_ROOT/node --strip-components=1 -xJf -

# Install Yarn (later to be removed)
curl -L https://yarnpkg.com/latest.tar.gz | tar --transform 's|yarn-[^/]*/|yarn/|' -C $DW_ROOT -zvxf -

# Install dependencies
PATH=$DW_ROOT/node/bin:$DW_ROOT/node_modules/.bin:$PATH
(
    cd $DW_ROOT
    # --ignore-engines is to ignore if we're using the wrong version of yarn
    ./yarn/bin/yarn install --dev --ignore-engines
)

# Clean up some stuff
rm -rf "$DW_ROOT/yarn"
rm -rf "$DW_ROOT/node/include"
rm -rf "$DW_ROOT/node/lib/node_modules/npm"
rm -rf "$DW_ROOT/node/bin/npm"
rm -rf "$DW_ROOT/node/bin/npx"

# tar up the result..
tar -C $DW_ROOT --transform 's|^\./|docker-worker/|' -czf $OUTPUT .
