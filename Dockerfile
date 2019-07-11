##
# Build /app

#ARG taskcluster_version
FROM node:10.16.0 as build

RUN mkdir -p /base /base/cache
ENV YARN_CACHE_FOLDER=/base/cache

# copy the repository into the image, including the entrypoint
COPY / /base/repo

# Clone that to /app
RUN git clone --depth 1 /base/repo /base/app

# set up the /app directory
WORKDIR /base/app
#RUN cp /base/repo/taskcluster-version taskcluster-version
RUN chmod +x entrypoint
RUN yarn install --frozen-lockfile

WORKDIR /base/app/ui
RUN yarn install --frozen-lockfile

# clean up some unnecessary and potentially large stuff
WORKDIR /base/app
RUN rm -rf .git
RUN rm -rf .node-gyp ui/.node-gyp
RUN rm -rf clients/client-{go,py,web}
RUN rm -rf {services,libraries}/*/test

##
# build the final image

FROM node:10.16.0-alpine as image
RUN apk update && apk add nginx && mkdir /run/nginx && apk add bash
COPY --from=build /base/app /app
ENV HOME=/app
WORKDIR /app
ENTRYPOINT ["/app/entrypoint"]
