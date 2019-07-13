// +build !linux,!darwin,!dragonfly,!freebsd,!netbsd,!openbsd

package shell

// taken from github.com/taskcluster/taskcluster-worker/blob/master/commands/shell/tty_unsupported.go

// setupRawTerminal does nothing on unsupported platforms
func setupRawTerminal(setSize func(cols, row uint16) error) func() {
	// Set default size, this is a somewhat sane thing to do on windows
	if setSize != nil {
		setSize(80, 20)
	}
	return func() {}
}
