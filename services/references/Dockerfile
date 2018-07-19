FROM nginx:1.13.12-alpine

ADD package.json yarn.lock /app/
ADD input /app/input/
ADD src /app/src/
ADD schemas /app/src/schemas
ADD nginx-site.conf /etc/nginx/conf.d/default.conf

# install node 8.9.3 and yarn (the version available in this alpine), then do a
# yarn install of the app (with versions pinned by the lock..)
RUN apk update && \
    apk upgrade && \
    apk add nodejs=8.9.3-r1 yarn=1.3.2-r0 && \
    cd /app && \
    yarn --production

CMD ["sh", "-c", "cd /app && yarn build && exec nginx -g 'daemon off;'"]
