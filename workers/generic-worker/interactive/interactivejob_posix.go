//go:build darwin || linux || freebsd

package interactive

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"time"

	"github.com/creack/pty"
	"golang.org/x/sys/unix"
)

type CmdPty struct {
	pty *os.File
	cmd *exec.Cmd
}
type InteractiveCmdType = *exec.Cmd
type InteractiveInnerType = CmdPty

func (itj *InteractiveJob) Setup(cmd InteractiveCmdType) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.Setpgid = false
	cmd.SysProcAttr.Setctty = true
	cmd.SysProcAttr.Setsid = true

	pty, err := pty.StartWithAttrs(cmd, nil, cmd.SysProcAttr)
	if err != nil {
		itj.reportError(fmt.Sprintf("Error while spawning command %v", err))
		return
	}
	itj.inner.pty = pty
	itj.inner.cmd = cmd

	go func() {
		itj.errors <- itj.inner.cmd.Wait()
		close(itj.done)
	}()

	// Wait for the spawned shell to clear ICANON before returning. Until that
	// happens, any input we forward from the websocket goes through the
	// kernel's canonical mode line discipline (line buffering + echo), and the
	// resulting echo trail depends on which side wins the race between our
	// write and readline taking over.
	waitForICANONOff(itj.inner.pty, itj.done)
}

func waitForICANONOff(p *os.File, done <-chan struct{}) {
	fd := int(p.Fd())
	ticker := time.NewTicker(2 * time.Millisecond)
	defer ticker.Stop()
	for {
		t, err := unix.IoctlGetTermios(fd, ioctlGetTermios)
		if err == nil && t.Lflag&unix.ICANON == 0 {
			return
		}
		select {
		case <-done:
			return
		case <-ticker.C:
		}
	}
}

func (itj *InteractiveJob) resizePty(width uint16, height uint16) error {
	sz := pty.Winsize{Rows: width, Cols: height}
	err := pty.Setsize(itj.inner.pty, &sz)

	return err
}

func (itj *InteractiveJob) readPty(buf []byte) (int, error) {
	return itj.inner.pty.Read(buf)
}

func (itj *InteractiveJob) writePty(buf []byte) (int, error) {
	return itj.inner.pty.Write(buf)
}

func (itj *InteractiveJob) terminate() error {
	return itj.inner.cmd.Process.Kill()
}
