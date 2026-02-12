FROM node:24.13.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable && \
  yarn set version stable && \
  yarn config set nodeLinker node-modules && \
  yarn install

COPY . ./

ENV PATH="/app/ui/node_modules/.bin:${PATH}"

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
