// +build darwin,simple linux,simple,simple freebsd

package main

import "os"

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}
