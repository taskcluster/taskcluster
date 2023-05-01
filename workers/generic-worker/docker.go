//go:build docker

package main

import (
	"os"
)

const (
	engine = "docker"
)

func platformFeatures() []Feature {
	return []Feature{}
}

func secure(configFile string) {
}

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}
