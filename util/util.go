package util

import (
	"regexp"
)

// Logger is used by Session to write logs
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

// Min returns minimum of two ints
func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

var (
	replaceHTTPSRe = regexp.MustCompile("^(http)(s?)")
	idReplaceRe    = regexp.MustCompile("^/(\\w+)(/?)")
)

// ReplaceID replaces id in "/{id}/path" with "/path"
func ReplaceID(path string) string {
	return idReplaceRe.ReplaceAllString(path, "/")
}

// MakeWsURL converts http:// to ws://
func MakeWsURL(url string) string {
	return replaceHTTPSRe.ReplaceAllString(url, "ws$2")
}
