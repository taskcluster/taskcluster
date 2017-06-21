FROM golang

RUN mkdir -p /go/src/github.com/
WORKDIR /go/src/github.com/taskcluster/
# clone and run webhooktunnel
RUN git clone http://github.com/taskcluster/webhooktunnel
WORKDIR /go/src/github.com/taskcluster/webhooktunnel
RUN go get -v
RUN go build
ENTRYPOINT ["./webhooktunnel"]
# expose ports when starting container
