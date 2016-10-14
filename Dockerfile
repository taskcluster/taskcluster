FROM scratch

EXPOSE 80
COPY target/taskcluster-proxy /taskcluster-proxy
COPY target/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
ENTRYPOINT ["/taskcluster-proxy", "--port", "80"]
