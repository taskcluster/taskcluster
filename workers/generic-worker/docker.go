//go:build docker

package main

import (
	"os"
	"strconv"
)

const (
	engine = "docker"
)

func secure(configFile string) {
}

func MkdirAllTaskUser(dir string, perms os.FileMode) (err error) {
	return os.MkdirAll(dir, perms)
}

func sleep(seconds uint) [][]string {
	return [][]string{
		{
			"sleep",
			strconv.Itoa(int(seconds)),
		},
	}
}
