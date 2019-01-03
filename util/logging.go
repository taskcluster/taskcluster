package util

// Logger is used by Session and Client to write logs
type Logger interface {
	Printf(format string, a ...interface{})
	Print(a ...interface{})
}

// NilLogger implements Logger and discards all writes
type NilLogger struct{}

// Printf discards writes
func (n *NilLogger) Printf(format string, a ...interface{}) {}

// Print discards writes
func (n *NilLogger) Print(a ...interface{}) {}
