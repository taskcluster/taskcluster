//go:build darwin || freebsd

package main

func disableNativePayloads() string {
	return ""
}

func d2gConfig() string {
	return ""
}

func loopbackDeviceNumbers() string {
	return ""
}
