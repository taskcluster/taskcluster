//go:generate go run codegen/fetch-apis.go

// Package apis implements all the API CommandProviders.
package apis

import (
	"strings"

	"github.com/taskcluster/taskcluster-cli/extpoints"
)

func init() {
	for name, service := range services {
		name = strings.ToLower(name[:1]) + name[1:]
		extpoints.Register(name, apiProvider{
			Name:    name,
			Service: service,
		})
	}
}
