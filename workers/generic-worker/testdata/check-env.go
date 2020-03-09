package main

import (
	"fmt"
	"log"
	"os"
)

// Usage: go run check-env.go [<ENV_VAR_NAME> <ENV_VAR_VALUE>]...
//
// This program will exit with a non-zero exit code if not every pair of
// (environment variable name, value) specified as parameters to the program
// exist in the program's environment.
func main() {
	for i := 1; i < len(os.Args); i += 2 {
		if os.Getenv(os.Args[i]) != os.Args[i+1] {
			log.Fatalf("Was expecting env var %v to have value %q but it has %q", os.Args[i], os.Args[i+1], os.Getenv(os.Args[i]))
		}
		fmt.Printf("Env var %v = %q\n", os.Args[i], os.Args[i+1])
	}
	fmt.Println("All ok")
}
