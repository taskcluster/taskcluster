// +build simple

package main

import "log"

const (
	engine = "simple"
)

func secure(configFile string) {
	log.Printf("WARNING: can't secure generic-worker config file %q", configFile)
}
