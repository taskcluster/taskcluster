package logging

import (
	"log"
	"os"
)

type stdioLogDestination struct {
	log *log.Logger
}

func (dst *stdioLogDestination) LogUnstructured(message string) {
	dst.log.Println(message)
}

func (dst *stdioLogDestination) LogStructured(message map[string]interface{}) {
	dst.log.Println(toUnstructured(message))
}

func NewStdioLogDestination() *stdioLogDestination {
	return &stdioLogDestination{log: log.New(os.Stderr, "", log.LstdFlags)}
}
