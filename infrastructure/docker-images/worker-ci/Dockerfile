FROM ubuntu:14.04

ARG NODE_VERSION
ENV DOCKER_VERSION=18.06.3~ce~3-0~ubuntu

RUN apt-get update && apt-get install -y apt-transport-https

# Add key for docker apt repository
COPY download.docker.com.gpg /tmp/download.docker.com.gpg
RUN apt-key add /tmp/download.docker.com.gpg && \
    echo "deb [arch=amd64] https://download.docker.com/linux/ubuntu trusty stable" > /etc/apt/sources.list.d/docker.list
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    docker-ce=$DOCKER_VERSION \
    git \
    iptables \
    lxc \
    python \
    jq

RUN curl -SL "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" | \
    tar xz -C /usr/local --strip-components=1 && \
    npm install -g babel-cli yarn@1.0.2

env HOME /home/tester
env SHELL /bin/bash
env PATH $PATH:/home/tester/bin
workdir /home/tester

COPY bin /home/tester/bin/
COPY ./wrapdocker /usr/local/bin/wrapdocker
COPY ./gitconfig /home/tester/.gitconfig

# install our custom git plugin
COPY git/git-ci-checkout-pr /usr/local/bin/git-ci-checkout-pr
COPY git/git-ci-checkout-ref /usr/local/bin/git-ci-checkout-ref
COPY git/git-ci-checkout-setup /usr/local/bin/git-ci-checkout-setup

RUN chmod +x /usr/local/bin/wrapdocker
RUN chmod a+x /home/tester/bin/*

# Define additional metadata for our image.
VOLUME /var/lib/docker

ENTRYPOINT ["wrapdocker"]
