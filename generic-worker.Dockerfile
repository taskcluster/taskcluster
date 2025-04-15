# Insecure generic worker

FROM golang:1.23.8-alpine AS build

ENV CGO_ENABLED=0

WORKDIR /app

# build depends on the .git
COPY . .

RUN apk add --no-cache bash git

WORKDIR /app/tools/livelog
RUN go build -o /livelog

WORKDIR /app/tools/worker-runner
RUN go build -o /start-worker ./cmd/start-worker

WORKDIR /app/tools/taskcluster-proxy
RUN go build -o /taskcluster-proxy

WORKDIR /app/clients/client-shell
RUN go build -o /taskcluster

WORKDIR /app/workers/generic-worker
RUN ./build.sh && \
  mv generic-worker-multiuser-* /generic-worker && \
  mv generic-worker-insecure-* /generic-worker-insecure

FROM ubuntu:jammy

RUN apt-get update && apt-get install -y \
  ca-certificates \
  curl \
  gzip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /livelog /taskcluster-proxy /start-worker /taskcluster /generic-worker* /usr/local/bin/
RUN ls -la /usr/local/bin

RUN mkdir -p /etc/generic-worker
RUN mkdir -p /var/local/generic-worker

# autogenerated ed25519 key is only good for local and testing
RUN generic-worker new-ed25519-keypair --file /etc/generic-worker/ed25519_key

# Write out the DockerFlow-compatible version.json file
ARG DOCKER_FLOW_VERSION
RUN if [ -n "${DOCKER_FLOW_VERSION}" ]; then \
    echo "${DOCKER_FLOW_VERSION}" > /version.json; \
else \
    echo \{\"version\": \"83.5.4\", \"commit\": \"local\", \"source\": \"https://github.com/taskcluster/taskcluster\", \"build\": \"NONE\"\} > /version.json; \
fi

VOLUME /etc/generic-worker
VOLUME /var/local/generic-worker

COPY workers/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
WORKDIR /var/local/generic-worker

ENTRYPOINT [ "/entrypoint.sh" ]
