// +build linux darwin dragonfly freebsd netbsd openbsd

package shell

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/burke/ttyutils"
)

// taken from github.com/taskcluster/taskcluster-worker/blob/master/commands/shell/tty_unix.go

// setupRawTerminal will set terminal to RAW mode and return function to
// restore normal terminal.
func setupRawTerminal(setSize func(cols, row uint16) error) func() {
	// Switch terminal to raw mode
	state, err := ttyutils.MakeTerminalRaw(os.Stdout.Fd())
	if err != nil {
		// If we can't do it just continue as we were
		return func() {}
	}

	// Get TTY size
	size, err := ttyutils.Winsize(os.Stdout)
	if err == nil && setSize != nil {
		setSize(size.Columns, size.Lines)
	}

	// Handle SIGWINCH signals (window resize signals from graphical terminals)
	sigWinch := make(chan os.Signal, 1)
	signal.Notify(sigWinch, syscall.SIGWINCH)
	go func() {
		for range sigWinch {
			size, err := ttyutils.Winsize(os.Stdout)
			if err == nil && setSize != nil {
				setSize(size.Columns, size.Lines)
			}
		}
	}()

	// Return a function to cleanup
	return func() {
		// Stop handling SIGWINCH, and close channel to clean up go routine
		signal.Stop(sigWinch)
		close(sigWinch)

		// Restore terminal state
		ttyutils.RestoreTerminalState(os.Stdout.Fd(), state)
		fmt.Println("")
	}
}
