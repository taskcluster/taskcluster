##
# Build /app

FROM node:10.16.3 as build

RUN mkdir -p /base/cache
ENV YARN_CACHE_FOLDER=/base/cache

RUN mkdir -p /base/yarn
COPY /yarn.lock /package.json /base/yarn/
RUN mkdir -p /base/yarn-ui
COPY /ui/yarn.lock /ui/package.json /base/yarn-ui/

WORKDIR /base/yarn
RUN yarn install --production --frozen-lockfile
WORKDIR /base/yarn-ui
RUN yarn install --frozen-lockfile

RUN mkdir -p /base/app/ui
RUN cp -r /base/yarn/node_modules /base/app/
RUN cp -r /base/yarn-ui/node_modules /base/app/ui/

# copy the repository into the image, including the entrypoint
COPY / /base/repo

# We have to do this rather than git clone because
# git won't let us clone into a non-empty repo
# We do this git stuff at all so that we don't
# make images with things people have in their
# personal gitignores, etc
WORKDIR /base/app
RUN git init
RUN git remote add origin /base/repo
RUN git pull --tags origin HEAD

RUN chmod +x entrypoint

# Now that node_modules are here, do some generation
RUN echo \{\"version\": \"$(git describe --tags --always --match v*.*.*)\", \"commit\": \"$(git rev-parse HEAD)\", \"source\": \"https://github.com/taskcluster/taskcluster\", \"build\": \"NONE\"\} > version.json

# Build the UI and discard everything else in that directory
WORKDIR /base/app/ui
RUN yarn build
WORKDIR /base/app

# clean up some unnecessary and potentially large stuff
RUN rm -rf .git
RUN rm -rf .node-gyp ui/.node-gyp
RUN rm -rf clients/client-{go,py,web}
RUN rm -rf {services,libraries}/*/test
RUN rm -rf ui/node_modules ui/src

##
# build the final image

FROM node:10.16.3-alpine as image
RUN apk update && apk add nginx && mkdir /run/nginx && apk add bash
COPY --from=build /base/app /app
ENV HOME=/app
WORKDIR /app
ENTRYPOINT ["/app/entrypoint"]
