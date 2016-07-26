package extpoints

import (
	"fmt"
	"sync"
)

var (
	mRegistry = sync.Mutex{}
	providers = make(map[string]CommandProvider)
)

// Register will register a CommandProvider for a given name.
func Register(name string, provider CommandProvider) {
	mRegistry.Lock()
	defer mRegistry.Unlock()

	if _, ok := providers[name]; ok {
		panic(fmt.Sprintf("A command named '%s' is already registered!", name))
	}
	providers[name] = provider
}

// CommandProviders returns a mapping from name to registered CommandProvider.
func CommandProviders() map[string]CommandProvider {
	mRegistry.Lock()
	defer mRegistry.Unlock()

	p := make(map[string]CommandProvider)
	for name, provider := range providers {
		p[name] = provider
	}
	return p
}
