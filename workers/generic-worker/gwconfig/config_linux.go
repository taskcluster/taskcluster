package gwconfig

import (
	"testing"

	"github.com/taskcluster/taskcluster/v93/tools/d2g"
)

type PublicPlatformConfig struct {
	D2GConfig                 d2g.Config `json:"d2gConfig"`
	DisableNativePayloads     bool       `json:"disableNativePayloads"`
	EnableLoopbackAudio       bool       `json:"enableLoopbackAudio"`
	EnableLoopbackVideo       bool       `json:"enableLoopbackVideo"`
	LoopbackAudioDeviceNumber uint8      `json:"loopbackAudioDeviceNumber"`
	LoopbackVideoDeviceNumber uint8      `json:"loopbackVideoDeviceNumber"`
}

func DefaultPublicPlatformConfig() *PublicPlatformConfig {
	return &PublicPlatformConfig{
		D2GConfig: d2g.Config{
			EnableD2G:             false,
			AllowChainOfTrust:     true,
			AllowDisableSeccomp:   true,
			AllowGPUs:             false,
			AllowHostSharedMemory: true,
			AllowInteractive:      true,
			AllowKVM:              true,
			AllowLoopbackAudio:    true,
			AllowLoopbackVideo:    true,
			AllowPrivileged:       true,
			AllowPtrace:           true,
			AllowTaskclusterProxy: true,
			GPUs:                  "all",
			LogTranslation:        true,
		},
		DisableNativePayloads:     false,
		EnableLoopbackAudio:       true,
		EnableLoopbackVideo:       true,
		LoopbackAudioDeviceNumber: 16,
		LoopbackVideoDeviceNumber: 0,
	}
}

func (c *PublicPlatformConfig) D2GEnabled() bool {
	return c.D2GConfig.EnableD2G
}

// Helper method used to enable D2G
// during testing.
func (c *PublicPlatformConfig) EnableD2G(t *testing.T) {
	t.Helper()
	c.D2GConfig.EnableD2G = true
}

func (c *PublicPlatformConfig) NativePayloadsDisabled() bool {
	return c.DisableNativePayloads
}
