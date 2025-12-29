FROM node:24.12.0-trixie-slim

VOLUME /builds/worker/checkouts

# Add worker user
RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    firefox-esr \
    git \
    xvfb && \
    rm -rf /var/lib/apt/lists/*

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
