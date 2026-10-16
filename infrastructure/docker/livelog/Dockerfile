FROM alpine:3 AS certs
RUN apk add --no-cache ca-certificates
RUN mkdir /empty
FROM scratch
EXPOSE 60023
EXPOSE 60022
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=certs /empty /tmp
COPY version.json /app/version.json
COPY livelog /livelog
ENTRYPOINT ["/livelog"]
