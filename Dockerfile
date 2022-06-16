##
# Build /app

FROM node:16.15.1 as build

RUN mkdir -p /base/cache
ENV YARN_CACHE_FOLDER=/base/cache

RUN mkdir -p /base/yarn
COPY /yarn.lock /.yarnrc /package.json /base/yarn/
COPY /.yarn /base/yarn/.yarn/
RUN mkdir -p /base/yarn-ui
COPY /ui/yarn.lock /.yarnrc /ui/package.json /base/yarn-ui/
COPY /.yarn /base/yarn-ui/.yarn/

WORKDIR /base/yarn
RUN yarn install --production --frozen-lockfile
WORKDIR /base/yarn-ui
RUN yarn install --frozen-lockfile

RUN mkdir -p /base/app/ui
RUN cp -r /base/yarn/node_modules /base/app/
RUN cp -r /base/yarn-ui/node_modules /base/app/ui/

# copy the repository into the image, including the entrypoint
WORKDIR /base/app
COPY . /base/app
RUN chmod +x entrypoint

# Write out the DockerFlow-compatible version.json file
ARG DOCKER_FLOW_VERSION
RUN if [ -n "${DOCKER_FLOW_VERSION}" ]; then \
    echo "${DOCKER_FLOW_VERSION}" > version.json; \
else \
    echo \{\"version\": \"44.16.3\", \"commit\": \"local\", \"source\": \"https://github.com/taskcluster/taskcluster\", \"build\": \"NONE\"\} > version.json; \
fi

# Build the UI and discard everything else in that directory
WORKDIR /base/app/ui
RUN yarn build
WORKDIR /base/app

# clean up some unnecessary and potentially large stuff
RUN rm -rf .git
RUN rm -rf .node-gyp ui/.node-gyp
RUN rm -rf clients/client-{go,py,web}
RUN rm -rf {services,libraries}/*/test
RUN rm -rf db/test db/versions
RUN rm -rf ui/node_modules ui/src

##
# build the final image

FROM node:16.15.1-alpine as image
RUN apk --no-cache add --update nginx bash
COPY --from=build /base/app /app
ENV HOME=/app
WORKDIR /app
ENTRYPOINT ["/app/entrypoint"]
