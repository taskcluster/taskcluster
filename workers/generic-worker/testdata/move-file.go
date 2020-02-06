package main

import (
	"log"
	"os"
)

func main() {
	log.SetFlags(0)
	log.SetPrefix("move-file.go: ")
	if len(os.Args) != 3 {
		log.Print("Usage: go run move-file.go [SOURCE_FILE] [TARGET_FILE]")
		log.Fatalf("Arguments specified: %#v", os.Args[1:])
	}
	log.Printf("Moving %v to %v", os.Args[1], os.Args[2])
	// doesn't happen automatically on Windows
	err := os.RemoveAll(os.Args[2])
	if err != nil {
		log.Printf("Could not remove %v: %s", os.Args[2], err)
		os.Exit(64)
	}
	err = os.Rename(os.Args[1], os.Args[2])
	if err != nil {
		log.Printf("Could not rename %v as %v: %s", os.Args[1], os.Args[2], err)
		os.Exit(65)
	}
	log.Print("Moved successfully.")
}
