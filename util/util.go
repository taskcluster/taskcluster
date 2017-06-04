package util

import (
	"regexp"
	"strings"
)

// Logger is used by Session to write logs
type Logger interface {
	Printf(format string, a ...interface{})
	Print(a ...interface{})
}

type NilLogger struct{}

func (n *NilLogger) Printf(format string, a ...interface{}) {}
func (n *NilLogger) Print(a ...interface{})                 {}

func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

var (
	replaceHTTPSRe = regexp.MustCompile("^(http)(s?)")
	idRe           = regexp.MustCompile("^/(\\w+)(/?)")
)

// ReplaceID replaces id in "/{id}/path" with "/path"
func ReplaceID(path string) string {
	return idRe.ReplaceAllString(path, "/")
}

func ExtractID(path string) string {
	path = strings.TrimPrefix(path, "/")
	index := strings.Index(path, "/")
	if index < 0 {
		return path
	}
	return path[:index]
}

// MakeWsURL converts http:// to ws://
func MakeWsURL(url string) string {
	return replaceHTTPSRe.ReplaceAllString(url, "ws$2")
}
