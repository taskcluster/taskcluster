FROM golang

RUN mkdir -p /go/src/github.com/
WORKDIR /go/src/github.com/taskcluster/
# clone and run websocktunnel
RUN git clone http://github.com/taskcluster/websocktunnel
WORKDIR /go/src/github.com/taskcluster/websocktunnel

# set envs 
ENV HOSTNAME=tcproxy.dev
ENV TASKCLUSTER_PROXY_SECRET_A=example-secret
ENV TASKCLUSTER_PROXY_SECRET_B=another-example-secret

RUN go get -v
ENTRYPOINT ["go", "run", "main.go"]
# expose ports when starting container
