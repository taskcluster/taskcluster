//go:build darwin || freebsd

package worker

func disableNativePayloads() string {
	return ""
}

func d2gConfig() string {
	return ""
}

func loopbackDeviceNumbers() string {
	return ""
}
