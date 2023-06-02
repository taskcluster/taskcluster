// Interactive package is currently not supported on Windows. This file is
// required by `build.sh -a` in the /workers/generic-worker directory to avoid
// the error "build constraints exclude all Go files" when compiling the tests
// for all packages.  `go test -c ./...` is currently not allowed, so build.sh
// explicitly runs `go test -c` against each package individually for each
// supported platform, which is why it fails when trying to compile tests for
// interactive package on windows.
//
// If at some point `go test -c ./...` is allowed in go, build.sh can be
// updated to use it, and this workaround can be avoided (i.e. this file can be
// deleted).

package test
