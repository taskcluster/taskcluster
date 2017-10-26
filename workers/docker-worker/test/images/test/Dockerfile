FROM node:8.6.0

# Top level bins to override system defaults
RUN npm install -g babel-cli babel-preset-es2015 babel-polyfill
RUN mkdir /hack_bins/
ENV PATH /hack_bins/:$PATH

# install AppArmor for the AA-related tests
RUN apt-get update
RUN apt-get install -y apparmor liblz4-tool

# Install Zstandard compression library
RUN git clone https://github.com/facebook/zstd /zstd && \
    cd /zstd && \
    make zstd && \
    mv zstd /usr/bin && \
    rm -rf /zstd

# hacks to ensure we can shutdown...
COPY ./shutdown /hack_bins/shutdown
RUN chmod u+x /hack_bins/shutdown
