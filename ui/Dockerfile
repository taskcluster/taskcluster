FROM node:20.18.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN corepack enable
RUN yarn

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
