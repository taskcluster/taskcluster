FROM ubuntu:14.04
MAINTAINER James Lal [:lightsofapollo] <jlal@mozilla.com>

RUN apt-get update
RUN apt-get install -y ca-certificates
EXPOSE 80
COPY target/taskcluster-proxy /taskcluster-proxy
ENTRYPOINT ["/taskcluster-proxy", "--port", "80"]
