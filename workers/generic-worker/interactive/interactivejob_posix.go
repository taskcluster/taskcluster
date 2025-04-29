//go:build darwin || linux || freebsd

package interactive

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
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
