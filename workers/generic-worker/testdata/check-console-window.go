//go:build windows

package main

import (
	"log"
	"os"
	"strconv"
	"syscall"
)

// Usage: go run check-console-window.go <expectHidden>
//
// This program checks whether a console window is attached to the process.
// It uses the GetConsoleWindow() Win32 API which returns:
//   - A handle to the console window if the process has a console
//   - NULL (0) if the process doesn't have a console
//
// When CREATE_NO_WINDOW flag is used (hideCmdWindow: true), the process
// doesn't get a console, so GetConsoleWindow() returns NULL.
//
// Arguments:
//
//	expectHidden: "true" if we expect no console window (hideCmdWindow enabled)
//	              "false" if we expect a console window (hideCmdWindow disabled/default)
//
// Exit codes:
//
//	0: Success - console window state matches expectation
//	1: Failure - console window state does not match expectation
func main() {
	if len(os.Args) != 2 {
		log.Fatalf("Usage: %s <expectHidden>", os.Args[0])
	}

	expectHidden, err := strconv.ParseBool(os.Args[1])
	if err != nil {
		log.Fatalf("Cannot parse boolean argument: %v", err)
	}

	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	procGetConsoleWindow := kernel32.NewProc("GetConsoleWindow")

	// GetConsoleWindow returns HWND (handle to console window) or NULL
	hwnd, _, _ := procGetConsoleWindow.Call()
	hasConsole := hwnd != 0

	if expectHidden && hasConsole {
		log.Fatalf("FAIL: Expected no console window (hideCmdWindow=true) but GetConsoleWindow() returned handle %#x", hwnd)
	}
	if !expectHidden && !hasConsole {
		log.Fatalf("FAIL: Expected console window (hideCmdWindow=false) but GetConsoleWindow() returned NULL")
	}

	if expectHidden {
		log.Printf("OK: hideCmdWindow=true, no console window attached (GetConsoleWindow returned NULL)")
	} else {
		log.Printf("OK: hideCmdWindow=false, console window attached (GetConsoleWindow returned %#x)", hwnd)
	}
}
