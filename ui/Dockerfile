FROM node:24.12.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable && \
  yarn set version stable && \
  yarn config set nodeLinker node-modules && \
  yarn install

COPY . ./

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
