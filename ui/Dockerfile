FROM node:18.17.1

WORKDIR /app/ui
COPY yarn.lock package.json ./

RUN yarn

ENTRYPOINT [ "yarn" ]
CMD [ "start:docker" ]
