package gwconfig

import "testing"

type PublicPlatformConfig struct {
	D2GConfig                 map[string]interface{} `json:"d2gConfig"`
	EnableInteractive         bool                   `json:"enableInteractive"`
	EnableLoopbackAudio       bool                   `json:"enableLoopbackAudio"`
	EnableLoopbackVideo       bool                   `json:"enableLoopbackVideo"`
	LoopbackAudioDeviceNumber uint8                  `json:"loopbackAudioDeviceNumber"`
	LoopbackVideoDeviceNumber uint8                  `json:"loopbackVideoDeviceNumber"`
}

func DefaultPublicPlatformConfig() *PublicPlatformConfig {
	return &PublicPlatformConfig{
		D2GConfig: map[string]interface{}{
			"enableD2G":             false,
			"allowChainOfTrust":     true,
			"allowDisableSeccomp":   true,
			"allowHostSharedMemory": true,
			"allowInteractive":      true,
			"allowKVM":              true,
			"allowLoopbackAudio":    true,
			"allowLoopbackVideo":    true,
			"allowPrivileged":       true,
			"allowPtrace":           true,
			"allowTaskclusterProxy": true,
			"containerEngine":       "docker",
		},
		EnableInteractive:         true,
		EnableLoopbackAudio:       true,
		EnableLoopbackVideo:       true,
		LoopbackAudioDeviceNumber: 16,
		LoopbackVideoDeviceNumber: 0,
	}
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return c.D2GConfig["enableD2G"].(bool)
}

// Helper method used to enable D2G
// during testing.
func (c *PublicPlatformConfig) EnableD2G(t *testing.T) {
	t.Helper()
	c.D2GConfig["enableD2G"] = true
}
