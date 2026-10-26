ARG BASE=taskcluster/taskcluster
FROM ${BASE}
USER root
RUN npm install --global nodemon
USER 1000
RUN yarn install && yarn cache clean --all
