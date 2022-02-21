# Build generic worker and run

FROM golang:1.17.7-buster as build

WORKDIR /app

RUN git clone --depth 1 --branch main --single-branch "https://github.com/taskcluster/taskcluster" .

ENV CGO_ENABLED=0
RUN cd tools/livelog && go build -o /livelog && cd ..
RUN cd tools/taskcluster-proxy && go build -o /taskcluster-proxy && cd ..
RUN cd workers/generic-worker && \
  ./build.sh && \
  mv generic-worker-docker-* /generic-worker-docker && \
  mv generic-worker-multiuser-* /generic-worker-multiuser && \
  mv generic-worker-simple-* /generic-worker


FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y ca-certificates curl gzip

COPY --from=build /livelog /taskcluster-proxy /generic-worker* /usr/local/bin/
RUN ls -la /usr/local/bin

RUN mkdir -p /etc/generic-worker
RUN mkdir -p /var/local/generic-worker
RUN echo '127.0.1.1 taskcluster' >> /etc/hosts
RUN generic-worker --version && \
  generic-worker new-ed25519-keypair --file /etc/generic-worker/ed25519_key

VOLUME /etc/generic-worker/config.json
VOLUME /var/local/generic-worker

COPY ./entrypoint.sh /entrypoint.sh
WORKDIR /var/local/generic-worker

ENTRYPOINT [ "/entrypoint.sh" ]
