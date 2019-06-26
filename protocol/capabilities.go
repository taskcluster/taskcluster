package protocol

import "sort"

var KnownCapabilities = []string{
	"graceful-termination",
}

type Capabilities struct {
	// use a map as a poor-man's set
	capabilities map[string]bool
}

func EmptyCapabilities() *Capabilities {
	return &Capabilities{
		capabilities: make(map[string]bool),
	}
}

func FullCapabilities() *Capabilities {
	return FromCapabilitiesList(KnownCapabilities)
}

func FromCapabilitiesList(caplist []string) *Capabilities {
	caps := make(map[string]bool)
	for _, c := range caplist {
		caps[c] = true
	}
	return &Capabilities{
		capabilities: caps,
	}
}

func (caps *Capabilities) List() []string {
	rv := make([]string, 0, len(caps.capabilities))
	for c := range caps.capabilities {
		rv = append(rv, c)
	}
	sort.Strings(rv)
	return rv
}

func (caps *Capabilities) Add(c string) {
	caps.capabilities[c] = true
}

func (caps *Capabilities) Remove(c string) {
	delete(caps.capabilities, c)
}

func (caps *Capabilities) Has(c string) bool {
	_, has := caps.capabilities[c]
	return has
}

func (caps *Capabilities) LimitTo(other *Capabilities) {
	newcaps := make(map[string]bool)
	for c := range caps.capabilities {
		if other.Has(c) {
			newcaps[c] = true
		}
	}
	caps.capabilities = newcaps
}
