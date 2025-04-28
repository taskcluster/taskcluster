//go:build insecure && (darwin || freebsd)

package main

func platformFeatures() []Feature {
	return []Feature{}
}
