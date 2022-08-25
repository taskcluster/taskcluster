FROM node:16.17.0

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN yarn

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
