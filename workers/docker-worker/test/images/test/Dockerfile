FROM node:0.11.13

# Top level bins to override system defaults
RUN npm install -g babel@4.7.16
RUN mkdir /hack_bins/
ENV PATH /hack_bins/:$PATH

# hacks to ensure we can shutdown...
COPY ./shutdown /hack_bins/shutdown
RUN chmod u+x /hack_bins/shutdown
