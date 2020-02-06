package main

import (
	"fmt"
	"log"
	"time"
)

// InitialiseLogger sets log prefix to date + time in UTC and includes timezone.
// See https://bugzil.la/1565215
func InitialiseLogger() {
	log.SetFlags(0)
	log.SetOutput(new(logWriter))
}

type logWriter struct {
}

func (writer logWriter) Write(bytes []byte) (int, error) {
	return fmt.Print(time.Now().UTC().Format("2006/01/02 15:04:05 UTC ") + string(bytes))
}
