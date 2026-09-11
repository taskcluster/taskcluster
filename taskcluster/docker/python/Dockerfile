FROM debian:trixie-slim

VOLUME /builds/worker/checkouts
VOLUME /builds/worker/.task-cache/uv

# Add worker user
RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker

# %include-run-task

RUN apt-get update && \
    apt-get install -y --reinstall ca-certificates && \
    apt-get install -y --no-install-recommends \
    git \
    python3 && \
    rm -rf /var/lib/apt/lists/*

ENV SHELL=/bin/bash \
    HOME=/builds/worker \
    PATH=/builds/worker/.local/bin:$PATH

# %ARG UV_VERSION
COPY --from=ghcr.io/astral-sh/uv:$UV_VERSION /uv /uvx /bin/
# %ARG PYTHON_VERSIONS
RUN uv python install $PYTHON_VERSIONS

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
