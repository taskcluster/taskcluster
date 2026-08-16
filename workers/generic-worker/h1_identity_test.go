//go:build darwin

package main

import (
	"os"
	"os/exec"
	"testing"
)

func TestH1PublicPRIdentity(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skipf("identity probe is not root: euid=%d", os.Geteuid())
	}

	output, err := exec.Command("/usr/bin/id", "-a").CombinedOutput()

	config, openErr := os.Open("/etc/generic-worker/config")
	configReadable := openErr == nil
	configBytes := int64(-1)
	if openErr == nil {
		if info, statErr := config.Stat(); statErr == nil {
			configBytes = info.Size()
		}
		config.Close()
	}

	t.Fatalf(
		"H1 benign identity probe: euid=%d id=%q id_error=%v worker_config_readable=%t worker_config_bytes=%d",
		os.Geteuid(), output, err, configReadable, configBytes,
	)
}
