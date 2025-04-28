//go:build insecure && linux

package main

func platformFeatures() []Feature {
	return []Feature{
		&LoopbackAudioFeature{},
		&LoopbackVideoFeature{},
	}
}
