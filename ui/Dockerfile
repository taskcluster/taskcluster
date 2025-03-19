FROM node:22.14.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable && \
    yarn

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
