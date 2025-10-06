//go:generate go run ./gw-codegen file://schemas/insecure_posix.yml     generated_insecure_linux.go      insecure
//go:generate go run ./gw-codegen file://schemas/insecure_darwin.go     insecure_darwin.go     insecure
//go:generate go run ./gw-codegen file://schemas/insecure_posix.yml     generated_insecure_freebsd.go    insecure
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_darwin.go    multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_linux.go     multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_posix.yml    generated_multiuser_freebsd.go   multiuser
//go:generate go run ./gw-codegen file://schemas/multiuser_windows.yml  generated_multiuser_windows.go   multiuser
// //go:generate go run ./gw-codegen file://../docker-worker/schemas/v1/payload.yml dockerworker/payload.go

package main

import (
	"github.com/taskcluster/taskcluster/v90/workers/generic-worker/internal/worker"
)

func init() {
	worker.InitialiseLogger()
}

// Entry point into the generic worker...
func main() {
	worker.Main()
}
