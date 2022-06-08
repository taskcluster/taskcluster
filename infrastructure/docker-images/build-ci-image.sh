#!/bin/bash

repo_root=$(dirname "$0")/../..
node_version=$(jq -r .engines.node "${repo_root}/package.json")
if [ -z "${node_version}" ]; then
    echo "Could not determine node version from top-level package.json"
    exit 1
fi

go_version=$(<${repo_root}/.go-version)
go_version=${go_version#go}
golangci_lint_version=$(<${repo_root}/.golangci-lint-version)
if [ -z "${go_version}" ]; then
    echo "Could not determine go version from top-level .go-version"
    exit 1
fi

pg_version=11

tmpdir=$(mktemp -d)
trap "cd /; rm -rf ${tmpdir}" EXIT
cat > ${tmpdir}/pginstall <<EOF
#!/bin/bash
set -ex

# install postgres
apt-get update
apt-get install -y curl ca-certificates gnupg
curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ buster-pgdg main" > /etc/apt/sources.list.d/pgdg.list
apt-get update
apt-get install -y postgresql-$pg_version

# add the en_US.UTF8 locale to the system
apt-get install -y --no-install-recommends locales
rm -rf /var/lib/apt/lists/*
localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8

# drop and re-create the default cluster with the appropriate locale
pg_dropcluster 11 main
pg_createcluster 11 main --lc-collate=en_US.UTF8 --lc-ctype=en_US.UTF8

# allow postgres to connect locally with no auth -- this is for testing!
echo 'local all all trust' > /etc/postgresql/$pg_version/main/pg_hba.conf
echo 'host all all 127.0.0.1/32 trust' >> /etc/postgresql/$pg_version/main/pg_hba.conf
echo 'host all all ::1/128 trust' >> /etc/postgresql/$pg_version/main/pg_hba.conf

EOF

cat > ${tmpdir}/Dockerfile <<EOF
FROM golang:${go_version}-buster as golang
FROM node:${node_version}-buster
COPY --from=golang /usr/local/go /usr/local/go
COPY --from=golang /go /go
ENV GOPATH /go
ENV PATH \$GOPATH/bin:/usr/local/go/bin:\$PATH
RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b \$GOPATH/bin v${golangci_lint_version}
COPY pginstall /pginstall
RUN bash /pginstall && rm /pginstall
ENV TEST_DB_URL=postgresql://postgres@localhost/postgres
EOF

docker build --platform linux/amd64 -t "taskcluster/ci-image:node${node_version}-pg${pg_version}-go${go_version}" ${tmpdir}
[ -n "$DOCKER_PUSH" ] && docker push "taskcluster/ci-image:node${node_version}-pg${pg_version}-go${go_version}"
