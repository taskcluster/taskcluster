package exit

import "golang.org/x/sys/windows"

// Shutdown initiates a system shutdown
func Shutdown() error {
	return windows.InitiateSystemShutdownEx(nil, nil, 0, true, false, 0)
}
