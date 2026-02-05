FROM golang:1.25.7-trixie AS golang
FROM node:24.13.0-trixie-slim

COPY --from=golang /usr/local/go /usr/local/go
COPY --from=golang /go /go
# %ARG UV_VERSION
COPY --from=ghcr.io/astral-sh/uv:$UV_VERSION /uv /uvx /bin/

VOLUME /builds/worker/checkouts

ENV GOPATH=/go \
    TEST_DB_URL=postgresql://postgres@localhost/postgres \
    SHELL=/bin/bash \
    HOME=/builds/worker \
    PATH="/go/bin:/usr/local/go/bin:/builds/worker/.local/bin:$PATH"

# %include .golangci-lint-version
ADD topsrcdir/.golangci-lint-version .

RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    build-essential \
    curl \
    git \
    gnupg \
    python3 && \
    curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | \
    sh -s -- -b $(go env GOPATH)/bin v$(cat .golangci-lint-version) && \
    install -d /usr/share/postgresql-common/pgdg && \
    curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    . /etc/os-release && \
    sh -c "echo 'deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $VERSION_CODENAME-pgdg main' > /etc/apt/sources.list.d/pgdg.list" && \
    apt-get update && \
    apt-get install -y postgresql-15 && \
    # add the en_US.UTF8 locale to the system
    apt-get install -y --no-install-recommends locales && \
    rm -rf /var/lib/apt/lists/* && \
    localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8 && \
    # drop and re-create the default cluster with the appropriate locale
    pg_dropcluster 15 main && \
    pg_createcluster 15 main --lc-collate=en_US.UTF8 --lc-ctype=en_US.UTF8 && \
    # allow postgres to connect locally with no auth -- this is for testing!
    echo 'local all all trust' > /etc/postgresql/15/main/pg_hba.conf && \
    echo 'host all all 127.0.0.1/32 trust' >> /etc/postgresql/15/main/pg_hba.conf && \
    echo 'host all all ::1/128 trust' >> /etc/postgresql/15/main/pg_hba.conf

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
