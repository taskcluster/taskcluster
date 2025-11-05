// This was heavily inspired by https://github.com/UserExistsError/conpty/blob/aff362cbe133d2e0818f6eeaffd66c84957a0cf1/conpty.go

package interactive

import (
	"context"
	"fmt"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"

	"github.com/taskcluster/taskcluster/v92/workers/generic-worker/win32"
	"golang.org/x/sys/windows"
)

var (
	kernel32                              = windows.NewLazySystemDLL("kernel32.dll")
	procCreatePseudoConsole               = kernel32.NewProc("CreatePseudoConsole")
	procResizePseudoConsole               = kernel32.NewProc("ResizePseudoConsole")
	procClosePseudoConsole                = kernel32.NewProc("ClosePseudoConsole")
	procInitializeProcThreadAttributeList = kernel32.NewProc("InitializeProcThreadAttributeList")
	procUpdateProcThreadAttribute         = kernel32.NewProc("UpdateProcThreadAttribute")
)

func CanUseConPty() bool {
	return procCreatePseudoConsole.Find() == nil &&
		procResizePseudoConsole.Find() == nil &&
		procClosePseudoConsole.Find() == nil &&
		procInitializeProcThreadAttributeList.Find() == nil &&
		procUpdateProcThreadAttribute.Find() == nil
}

const (
	PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE uintptr = 0x20016
)

type COORD struct {
	width, height int16
}

func (c *COORD) Pack() uintptr {
	return uintptr((int32(c.width) << 16) | int32(c.height))
}

type HPCON windows.Handle

type handleIO struct {
	handle windows.Handle
}

func (h *handleIO) Read(p []byte) (int, error) {
	var numRead uint32 = 0
	err := windows.ReadFile(h.handle, p, &numRead, nil)
	return int(numRead), err
}

func (h *handleIO) Write(p []byte) (int, error) {
	var numWritten uint32 = 0
	err := windows.WriteFile(h.handle, p, &numWritten, nil)
	return int(numWritten), err
}

func (h *handleIO) Close() error {
	return windows.CloseHandle(h.handle)
}

type ConPty struct {
	hpc                          HPCON
	pi                           *windows.ProcessInformation
	ptyIn, ptyOut, cmdIn, cmdOut *handleIO
}

func win32ResizePseudoConsole(hPc HPCON, coord *COORD) error {
	ret, _, _ := procResizePseudoConsole.Call(uintptr(hPc), coord.Pack())
	if ret != 0 {
		return fmt.Errorf("ResizePseudoConsole failed with status 0x%x", ret)
	}
	return nil
}

func win32CreatePseudoConsole(c *COORD, hIn, hOut windows.Handle) (HPCON, error) {
	var hPc HPCON
	ret, _, _ := procCreatePseudoConsole.Call(
		c.Pack(),
		uintptr(hIn),
		uintptr(hOut),
		0,
		uintptr(unsafe.Pointer(&hPc)))
	if ret != 0 {
		return 0, fmt.Errorf("CreatePseudoConsole() failed with status 0x%x", ret)
	}
	return hPc, nil
}

type _StartupInfoEx struct {
	startupInfo   windows.StartupInfo
	attributeList []byte
}

func getStartupInfoExForConPty(hpc HPCON) (*_StartupInfoEx, error) {
	var siEx _StartupInfoEx
	siEx.startupInfo.Cb = uint32(unsafe.Sizeof(windows.StartupInfo{}) + unsafe.Sizeof(&siEx.attributeList[0]))
	siEx.startupInfo.Flags |= windows.STARTF_USESTDHANDLES
	var size uintptr

	// windows requires us to call this twice, once to get the size required, and then with the actual value
	ret, _, _ := procInitializeProcThreadAttributeList.Call(0, 1, 0, uintptr(unsafe.Pointer(&size)))
	if ret != 0 {
		return nil, fmt.Errorf("InitializeProcThreadAttributeList should've returned 0")
	}
	siEx.attributeList = make([]byte, size)
	ret, _, err := procInitializeProcThreadAttributeList.Call(
		uintptr(unsafe.Pointer(&siEx.attributeList[0])),
		1,
		0,
		uintptr(unsafe.Pointer(&size)))
	if ret != 1 {
		return nil, fmt.Errorf("InitializeProcThreadAttributeList: %v", err)
	}

	ret, _, err = procUpdateProcThreadAttribute.Call(
		uintptr(unsafe.Pointer(&siEx.attributeList[0])),
		0,
		PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
		uintptr(hpc),
		unsafe.Sizeof(hpc),
		0,
		0)
	if ret != 1 {
		return nil, fmt.Errorf("InitializeProcThreadAttributeList: %v", err)
	}
	return &siEx, nil
}

func createConsoleProcessAttachedToPTY(hpc HPCON, commandLine []string, workDir string, env []string, token windows.Token) (*windows.ProcessInformation, error) {
	cmdLine, err := windows.UTF16PtrFromString(strings.Join(commandLine, " "))
	if err != nil {
		return nil, err
	}
	var currentDirectory *uint16
	if workDir != "" {
		currentDirectory, err = windows.UTF16PtrFromString(workDir)
		if err != nil {
			return nil, err
		}
	}

	var envBlock *uint16
	flags := uint32(windows.EXTENDED_STARTUPINFO_PRESENT)
	if env != nil {
		envStr, err := win32.CreateEnvironment(&env, syscall.Token(token))
		if err != nil {
			return nil, err
		}
		envBlock = &utf16.Encode([]rune(strings.Join(*envStr, "\x00") + "\x00\x00"))[0]
		flags |= uint32(windows.CREATE_UNICODE_ENVIRONMENT)
	}

	siEx, err := getStartupInfoExForConPty(hpc)
	if err != nil {
		return nil, err
	}

	var pi windows.ProcessInformation
	err = windows.CreateProcessAsUser(
		token,
		nil, // use this if no args
		cmdLine,
		nil,
		nil,
		false, // inheritHandle
		flags,
		envBlock,
		currentDirectory,
		&siEx.startupInfo,
		&pi)
	if err != nil {
		return nil, err
	}
	return &pi, nil
}

// This will only return the first error.
func closeHandles(handles ...windows.Handle) error {
	var err error
	for _, h := range handles {
		if h != windows.InvalidHandle {
			if err == nil {
				err = windows.CloseHandle(h)
			} else {
				_ = windows.CloseHandle(h)
			}
		}
	}
	return err
}

// Close all open handles and terminate the process.
func (conpty *ConPty) Close() error {
	// ClosePseudoConsole return is void
	_, _, _ = procClosePseudoConsole.Call(uintptr(conpty.hpc))
	return closeHandles(
		conpty.pi.Process,
		conpty.pi.Thread,
		conpty.ptyIn.handle,
		conpty.ptyOut.handle,
		conpty.cmdIn.handle,
		conpty.cmdOut.handle)
}

// Wait for the process to exit and return the exit code. If context is canceled,
// Wait() will return STILL_ACTIVE and an error indicating the context was canceled.
func (conpty *ConPty) Wait(ctx context.Context) error {
	var exitCode uint32 = 0
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("wait canceled: %v", err)
		}
		ret, _ := windows.WaitForSingleObject(conpty.pi.Process, 1000)
		if ret != uint32(windows.WAIT_TIMEOUT) {
			err := windows.GetExitCodeProcess(conpty.pi.Process, &exitCode)
			return err
		}
	}
}

func (conpty *ConPty) Resize(width, height int) error {
	coords := COORD{
		int16(width),
		int16(height),
	}

	return win32ResizePseudoConsole(conpty.hpc, &coords)
}

func (conpty *ConPty) Read(p []byte) (int, error) {
	return conpty.cmdOut.Read(p)
}

func (conpty *ConPty) Write(p []byte) (int, error) {
	return conpty.cmdIn.Write(p)
}

func (conpty *ConPty) Pid() int {
	return int(conpty.pi.ProcessId)
}

func StartConPty(commandLine []string, workDir string, env []string, token windows.Token) (*ConPty, error) {
	if !CanUseConPty() {
		return nil, fmt.Errorf("your version of windows does not support ConPty")
	}

	var cmdIn, cmdOut, ptyIn, ptyOut windows.Handle
	if err := windows.CreatePipe(&ptyIn, &cmdIn, nil, 0); err != nil {
		return nil, fmt.Errorf("CreatePipe: %v", err)
	}
	if err := windows.CreatePipe(&cmdOut, &ptyOut, nil, 0); err != nil {
		_ = closeHandles(ptyIn, cmdIn)
		return nil, fmt.Errorf("CreatePipe: %v", err)
	}

	size := COORD{40, 160}

	hPc, err := win32CreatePseudoConsole(&size, ptyIn, ptyOut)
	if err != nil {
		_ = closeHandles(ptyIn, ptyOut, cmdIn, cmdOut)
		return nil, err
	}

	pi, err := createConsoleProcessAttachedToPTY(hPc, commandLine, workDir, env, token)
	if err != nil {
		_ = closeHandles(ptyIn, ptyOut, cmdIn, cmdOut)
		_, _, _ = procClosePseudoConsole.Call(uintptr(hPc))
		return nil, fmt.Errorf("failed to create console process: %v", err)
	}

	conpty := &ConPty{
		hpc:    hPc,
		pi:     pi,
		ptyIn:  &handleIO{ptyIn},
		ptyOut: &handleIO{ptyOut},
		cmdIn:  &handleIO{cmdIn},
		cmdOut: &handleIO{cmdOut},
	}
	return conpty, nil
}
