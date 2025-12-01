FROM node:24.11.1-trixie

VOLUME /builds/worker/checkouts

# Add worker user
RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker

RUN apt-get update && apt-get install -y \
    firefox-esr \
    xvfb && \
    rm -rf /var/lib/apt/lists/*

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
