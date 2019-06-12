// +build simple

package main

import "log"

const (
	engine = "simple"
)

func secureConfigFile() {
	log.Print("WARNING: can't secure generic-worker config file")
}
