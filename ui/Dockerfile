FROM node:22.13.1

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable && \
    yarn

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
