# Browser-Test Docker Image

This folder defines a docker image suitable for testing things in a browser.

The image is based on the same Node version as the rest of Taskcluster, but
includes a copy of the ESR version of Firefox.  Tests should not be
particularly sensitive to the Firefox version.  The image label is based on the
Node version defined in the root `package.json`.

To generate the docker image, run `./build.sh`.

Test the image with the following, which approximates what runs in CI:

```shell
docker run -ti --rm -v $PWD:/repo taskcluster/browser-test:10.14.0 bash -c '
    git clone /repo /build &&
    cd /build/clients/client-web &&
    yarn &&
    { Xvfb :99 -screen 0 640x480x8 -nolisten tcp & } &&
    sleep 2 &&
    CHROME_BIN=firefox DISPLAY=:99 yarn test'
```
