FROM progrium/busybox
MAINTAINER James Lal [:lightsofapollo] <jlal@mozilla.com>

RUN opkg-install ca-certificates

EXPOSE 60023
EXPOSE 60022
COPY target/livelog  /livelog
ENTRYPOINT ["/livelog"]
