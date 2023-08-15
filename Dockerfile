##
# Build /app

FROM node:18.17.1 as build

RUN mkdir -p /base/cache
ENV YARN_CACHE_FOLDER=/base/cache

# prepare top level dependencies
RUN mkdir -p /base/yarn
COPY /yarn.lock /.yarnrc /package.json /base/yarn/
COPY /.yarn /base/yarn/.yarn/
# prepare ui dependencies
RUN mkdir -p /base/yarn-ui
COPY /ui/yarn.lock /.yarnrc /ui/package.json /base/yarn-ui/
COPY /.yarn /base/yarn-ui/.yarn/
# prepare clients/client dependencies
RUN mkdir -p /base/yarn-client
COPY /clients/client/yarn.lock /.yarnrc /clients/client/package.json /base/yarn-client/
COPY /.yarn /base/yarn-client/.yarn/

# install all dependencies
WORKDIR /base/yarn-client
RUN yarn install --production --frozen-lockfile
WORKDIR /base/yarn
RUN yarn install --production --frozen-lockfile
WORKDIR /base/yarn-ui
RUN yarn install --frozen-lockfile

RUN mkdir -p /base/app/ui /base/app/clients/client
RUN cp -r /base/yarn/node_modules /base/app/
RUN cp -r /base/yarn-ui/node_modules /base/app/ui/
RUN cp -r /base/yarn-client/node_modules /base/app/clients/client/

# copy the repository into the image, including the entrypoint
WORKDIR /base/app
COPY . /base/app
RUN chmod +x entrypoint

# Write out the DockerFlow-compatible version.json file
ARG DOCKER_FLOW_VERSION
RUN if [ -n "${DOCKER_FLOW_VERSION}" ]; then \
    echo "${DOCKER_FLOW_VERSION}" > version.json; \
else \
    echo \{\"version\": \"54.4.2\", \"commit\": \"local\", \"source\": \"https://github.com/taskcluster/taskcluster\", \"build\": \"NONE\"\} > version.json; \
fi

# Build the UI and discard everything else in that directory
WORKDIR /base/app/ui
RUN yarn build
WORKDIR /base/app

# clean up some unnecessary and potentially large stuff
RUN /bin/bash -c "\
    rm -rf .git; \
    rm -rf clients/client-{go,py,web}; \
    rm -rf {services,libraries}/*/test; \
    rm -rf db/test db/versions; \
    rm -rf ui/node_modules ui/src ui/test; \
    "

##
# build the final image

FROM node:18.17.1-alpine as image
RUN apk --no-cache add --update nginx bash
COPY --from=build /base/app /app
ENV HOME=/app
WORKDIR /app
ENTRYPOINT ["/app/entrypoint"]
