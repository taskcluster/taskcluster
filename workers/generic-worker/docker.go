// +build docker

package main

import "os"

const (
	engine = "docker"
)

func secure(configFile string) {
}

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return nil
}
