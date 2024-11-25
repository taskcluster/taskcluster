//go:build darwin || freebsd

package main

func d2gConfig() string {
	return ""
}

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]`
}

func loopbackDeviceNumbers() string {
	return ""
}
