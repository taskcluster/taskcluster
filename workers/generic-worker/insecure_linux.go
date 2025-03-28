//go:build insecure && linux

package main

func platformFeatures() []Feature {
	return []Feature{
		&ResourceMonitorFeature{},
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
	}
}
