package workerproto

import "sort"

type capabilities struct {
	// use a map as a poor-man's set
	capabilities map[string]bool
}

func EmptyCapabilities() *capabilities {
	return &capabilities{
		capabilities: make(map[string]bool),
	}
}

func FromCapabilitiesList(caplist []string) *capabilities {
	caps := make(map[string]bool)
	for _, c := range caplist {
		caps[c] = true
	}
	return &capabilities{
		capabilities: caps,
	}
}

func (caps *capabilities) List() []string {
	rv := make([]string, 0, len(caps.capabilities))
	for c := range caps.capabilities {
		rv = append(rv, c)
	}
	sort.Strings(rv)
	return rv
}

func (caps *capabilities) Add(c string) {
	caps.capabilities[c] = true
}

func (caps *capabilities) Remove(c string) {
	delete(caps.capabilities, c)
}

func (caps *capabilities) Has(c string) bool {
	_, has := caps.capabilities[c]
	return has
}

func (caps *capabilities) LimitTo(other *capabilities) {
	newcaps := make(map[string]bool)
	for c := range caps.capabilities {
		if other.Has(c) {
			newcaps[c] = true
		}
	}
	caps.capabilities = newcaps
}
