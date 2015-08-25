Ubuntu-CI
=========

A basic Linux container, with node/npm and python/pip, which will try to check out a github project
on login (via its bashrc). The worker user also has access to a bash function which will attempt to automatically run tests for projects in various languages: node, python, go
