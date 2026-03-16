FROM node:24.14.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable && \
  yarn set version stable && \
  yarn config set nodeLinker node-modules && \
  yarn install

COPY . ./

ENV PATH="/app/ui/node_modules/.bin:${PATH}"
ENV NODE_ENV=development

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
