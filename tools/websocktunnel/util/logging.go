package util

// Logger is used by Session and Client to write logs
type Logger interface {
	Printf(format string, a ...any)
	Print(a ...any)
}

// NilLogger implements Logger and discards all writes
type NilLogger struct{}

// Printf discards writes
func (n *NilLogger) Printf(format string, a ...any) {}

// Print discards writes
func (n *NilLogger) Print(a ...any) {}
