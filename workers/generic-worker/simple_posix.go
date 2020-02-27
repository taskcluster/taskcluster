// +build darwin,simple linux,simple freebsd,simple

package main

import "os"

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}
