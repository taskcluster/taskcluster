FROM          ubuntu:14.04
MAINTAINER    Morgan Reece Phillips <winter2718@gmail.com>

RUN apt-get update -y
RUN apt-get install -y git \
    python-all \
    python-dev \
    python-pip \
    nodejs \
    nodejs-legacy \
    npm \
    libmysqlclient-dev # for MySQL-python \
    libpq-dev # for psycopg2 \
    && apt-get clean

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
RUN           mkdir -p /home/worker/bin
COPY          entrypoint.sh /home/worker/bin/
COPY          checkout-pull-request /home/worker/bin/
RUN           chmod 755 /home/worker/bin/*
RUN           chown -R worker:worker /home/worker
USER          worker

ENTRYPOINT ["/home/worker/bin/entrypoint.sh"]

# Set a default command useful for debugging
CMD ["/bin/bash", "--login"]
