#!/bin/bash

for script in build-*.sh; do
    DOCKER_PUSH=--push ./$script || break
done
