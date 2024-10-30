FROM golang:1.23.2-bookworm AS golang
FROM node:22.11.0-bookworm

COPY --from=golang /usr/local/go /usr/local/go
COPY --from=golang /go /go

ENV GOPATH=/go
ENV PATH="$GOPATH/bin:/usr/local/go/bin:$PATH"

# %include .golangci-lint-version
ADD topsrcdir/.golangci-lint-version .

RUN curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | \
    sh -s -- -b $(go env GOPATH)/bin v$(cat .golangci-lint-version) && \
    apt-get update && \
    apt-get install -y \
    ca-certificates \
    gnupg && \
    curl https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - && \
    echo "deb http://apt.postgresql.org/pub/repos/apt/ bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list && \
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

ENV TEST_DB_URL=postgresql://postgres@localhost/postgres

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
