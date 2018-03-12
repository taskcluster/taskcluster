# Taskcluster Web

This repository contains a collection of useful tools for use with Taskcluster.
Generally, we strive to not add UI to Taskcluster components, but instead offer
well documented APIs that can be easily consumed using a client library for
Taskcluster. 

To get started local development, create a file in the root of the repo named
`.env` with the following content, or whatever content you wish:

```bash
APPLICATION_NAME="Taskcluster"
```
