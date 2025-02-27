//go:build insecure && linux

package main

func platformFeatures() []Feature {
	return []Feature{
		&InteractiveFeature{},
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
	}
}
