//go:build windows

package runner

import (
	"time"

	"golang.org/x/sys/windows/registry"
)

const windowsSetupStateKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Setup\State`

func readWindowsImageState() (string, error) {
	key, err := registry.OpenKey(
		registry.LOCAL_MACHINE,
		windowsSetupStateKey,
		registry.QUERY_VALUE|registry.WOW64_64KEY,
	)
	if err != nil {
		return "", err
	}
	defer key.Close()

	imageState, _, err := key.GetStringValue("ImageState")
	return imageState, err
}

func waitForWindowsImageState() {
	waitForImageStateComplete(readWindowsImageState, func() {
		time.Sleep(10 * time.Second)
	})
}
