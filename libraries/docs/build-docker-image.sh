# /bin/bash

set -ex

if ! [ -f package.json ]; then
    echo "run this from the root of the repo"
    exit 1
fi

VERSION=`grep "  \"version\":" package.json | cut -d\" -f 4`

SRCDIR=`pwd`
DOCKERDIR=`mktemp -d`
trap "{ rm -rf $DOCKERDIR; }" EXIT

cd "$DOCKERDIR"
cp -r "$SRCDIR" app/
rm -rf app/.git app/node_modules app/lib

cat > Dockerfile <<'EOF'
FROM node:6
MAINTAINER Dustin J. Mitchell <dustin@mozilla.com>

COPY app/ /app
RUN cd /app \
    && npm install \
    && npm run compile \
    && ( echo '# /bin/bash'; echo 'node /app/lib/upload-project-docs.js' ) > /usr/local/bin/upload-project-docs \
    && chmod +x /usr/local/bin/upload-project-docs
EOF

docker build --no-cache -t taskcluster/upload-project-docs:$VERSION .
docker tag taskcluster/upload-project-docs:$VERSION taskcluster/upload-project-docs:latest

echo "If taskcluster/upload-project-docs:$VERSION is suitable, run"
echo docker push taskcluster/upload-project-docs:$VERSION
echo docker push taskcluster/upload-project-docs:latest
