FROM ubuntu:14.04
MAINTAINER James Lal [:lightsofapollo] <jlal@mozilla.com>

EXPOSE 60023
EXPOSE 60022
COPY target/continuous-log-serve  /continuous-log-serve
ENTRYPOINT ["/continuous-log-serve"]
