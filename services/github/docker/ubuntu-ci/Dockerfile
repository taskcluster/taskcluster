FROM          ubuntu:14.04
MAINTAINER    Morgan Reece Phillips <winter2718@gmail.com>

RUN apt-get update -y
RUN apt-get install -y git \
    python-all \
    python-dev \
    python-pip \
    nodejs \
    nodejs-legacy \
    npm

RUN pip install virtualenv
RUN pip install virtualenvwrapper

# configure git and install tc-vcs
RUN git config --global user.email "nobody@mozilla.com" && \
    git config --global user.name "mozilla"

# Set variable normally configured at login, by the shells parent process, these
# are taken from GNU su manual
ENV           HOME          /home/worker
ENV           SHELL         /bin/bash
ENV           USER          worker
ENV           LOGNAME       worker
ENV           HOSTNAME      taskcluster-worker

### add worker user and setup its workspace
RUN           useradd -d /home/worker -s /bin/bash -m worker
WORKDIR       /home/worker
ADD           bashrc /home/worker/.bashrc
RUN           chown -R worker:worker /home/worker
USER          worker

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
