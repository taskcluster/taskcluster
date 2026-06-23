FROM node:24.17.0-trixie-slim

VOLUME /builds/worker/checkouts

# Bake the Playwright Chromium and Firefox browsers into the image so CI runs
# don't re-download them every time. Must match the playwright version in
# ui/package.json and clients/client-web/package.json.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_VERSION=1.60.0

# Add worker user
RUN mkdir -p /builds && \
    useradd -d /builds/worker -s /bin/bash -m worker && \
    mkdir /builds/worker/artifacts && \
    chown -R worker:worker /builds/worker && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git && \
    npx -y @playwright/test@${PLAYWRIGHT_VERSION} install --with-deps chromium firefox && \
    chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}" && \
    rm -rf /var/lib/apt/lists/*

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
