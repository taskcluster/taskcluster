#!/bin/bash

for script in build-*.sh; do
    DOCKER_PUSH=1 ./$script || break
done
