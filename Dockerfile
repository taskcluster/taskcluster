FROM debian:wheezy
MAINTAINER James Lal [:lightsofapollo] <jlal@mozilla.com>

EXPOSE 80
COPY target/proxy /proxy
ENTRYPOINT ["/proxy", "--port", "80"]
