# Test Docker Image

This folder defines two images:

1. A docker image suitable for testing things in a browser.
2. A docker image used for testing things that need a running rabbit server.

The images are based on the same Node version as the rest of Taskcluster.
The image label is based on the Node version defined in the root `package.json`.

To generate the docker images, [install jq](https://github.com/stedolan/jq/wiki/Installation) and run `./build.sh`.
If you are happy with the results, you have to push them to make them available for tests in taskcluster.

## Browser Test

The browser-test image includes a copy of the ESR version of Firefox. Tests should not be
particularly sensitive to the Firefox version.

Test the browser-test image with the following, which approximates what runs in CI:

```shell
docker run -ti --rm -v $PWD:/repo taskcluster/browser-test:10.14.0 bash -c '
    git clone /repo /build &&
    cd /build/clients/client-web &&
    yarn &&
    { Xvfb :99 -screen 0 640x480x8 -nolisten tcp & } &&
    sleep 2 &&
    CHROME_BIN=firefox DISPLAY=:99 yarn test'
```

## Rabbit Test

This is pretty much exactly the standard node image but with rabbitmq-server installed.
