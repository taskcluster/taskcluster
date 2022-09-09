FROM ubuntu:20.04

ARG NODE_VERSION
ENV DOCKER_VERSION=5:20.10.12~3-0~ubuntu-focal

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gnupg \
    lsb-release

# Add key for docker apt repository
COPY download.docker.com.gpg /tmp/download.docker.com.gpg
RUN gpg --dearmor \
        -o /usr/share/keyrings/docker-archive-keyring.gpg \
        /tmp/download.docker.com.gpg && \
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        | tee /etc/apt/sources.list.d/docker.list

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    docker-ce=$DOCKER_VERSION \
    git \
    iptables \
    lxc \
    python3 \
    jq

RUN curl -SL "http://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" | \
    tar --xz --extract --directory /usr/local --strip-components=1 && \
    npm install -g yarn@1.0.2 && \
    yarn global add babel-cli

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
