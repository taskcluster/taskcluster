FROM golang:1.10 AS build

ADD . /go/src/github.com/taskcluster/websocktunnel
WORKDIR /go/src/github.com/taskcluster/websocktunnel

# build without CGO to create a statically-linked binary
RUN CGO_ENABLED=0 go install ./...

RUN ls -al /go/bin

FROM scratch

COPY --from=build /go/bin/websocktunnel /websocktunnel

ENTRYPOINT ["/websocktunnel"]
