//go:build multiuser

package main

import (
	"log"
)

func defaultTasksDir() string {
	return "/home"
}

func platformTargets(arguments map[string]any) ExitCode {
	log.Print("Internal error - no target found to run, yet command line parsing successful")
	return INTERNAL_ERROR
}
