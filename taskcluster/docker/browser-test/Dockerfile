FROM node:24.16.0-trixie-slim

VOLUME /builds/worker/checkouts

# Bake the Playwright Chromium browser into the image so CI runs don't
# re-download it (~200MB) every time. Must match the playwright version
# in ui/package.json.
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
    firefox-esr \
    git \
    xvfb && \
    npx -y @playwright/test@${PLAYWRIGHT_VERSION} install --with-deps chromium && \
    chmod -R a+rX "${PLAYWRIGHT_BROWSERS_PATH}" && \
    rm -rf /var/lib/apt/lists/*

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
