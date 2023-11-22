//go:build simple && (darwin || linux || freebsd)

package main

import "os"

func MkdirAllTaskUser(dir string) error {
	return os.MkdirAll(dir, 0700)
}
