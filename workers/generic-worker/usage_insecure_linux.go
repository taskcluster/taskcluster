//go:build insecure

package main

func enableTaskFeatures() string {
	return `
          enableInteractive                 Enables the Interactive feature to be used in the
                                            task payload. [default: true]
          enableLoopbackAudio               Enables the Loopback Audio feature to be used in the
                                            task payload. [default: true]
          enableLoopbackVideo               Enables the Loopback Video feature to be used in the
                                            task payload. [default: true]`
}
