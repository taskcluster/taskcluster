FROM ubuntu:latest

RUN apt update
RUN apt install -y git software-properties-common
RUN add-apt-repository -y ppa:longsleep/golang-backports
RUN apt update
RUN apt install -y golang-go
# setup gopath
RUN mkdir -p gopath/src/github.com/taskcluster
ENV GOPATH=/gopath
WORKDIR /gopath/src/github.com/taskcluster
# clone and run webhooktunnel
RUN git clone http://github.com/taskcluster/webhooktunnel
WORKDIR webhooktunnel
RUN go get -v
RUN go build
ENTRYPOINT ["./webhooktunnel"]
# expose ports when starting container
