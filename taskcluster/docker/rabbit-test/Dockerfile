FROM node:24.12.0-trixie

VOLUME /builds/worker/checkouts

# Add worker user
RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker

RUN apt-get update && apt-get install -y \
    rabbitmq-server && \
    rm -rf /var/lib/apt/lists/*

ENV SHELL=/bin/bash \
    HOME=/builds/worker \
    PATH=/builds/worker/.local/bin:$PATH

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
