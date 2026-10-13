# get the latest ca-certificates from Alpine
FROM alpine:3 AS certs
RUN apk add --no-cache ca-certificates
# start over in an empty image and just copy the certs in
FROM scratch
EXPOSE 80
COPY version.json /app/version.json
COPY taskcluster-proxy /taskcluster-proxy
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENTRYPOINT ["/taskcluster-proxy", "--port", "80"]
