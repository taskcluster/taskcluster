FROM node:26.13.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN npm install -g corepack@0.36.0 && \
  yarn set version stable && \
  yarn config set nodeLinker node-modules && \
  yarn install

COPY . ./

ENV PATH="/app/ui/node_modules/.bin:${PATH}"

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
