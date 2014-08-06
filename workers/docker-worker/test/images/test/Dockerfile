FROM taskcluster/docker-worker

# Top level bins to override system defaults
RUN mkdir /hack_bins/
ENV PATH /hack_bins/:$PATH

# hacks to ensure we can shutdown...
COPY ./shutdown /hack_bins/shutdown
RUN chmod u+x /hack_bins/shutdown
