package util

import (
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

func ReplaceID(path string) string {
	s := path
	if s == "" {
		return s
	}
	s = strings.TrimPrefix(s, "/")
	index := strings.Index(s, "/")
	if index < 0 {
		return s
	}
	return s[index:]
}

func ExtractID(path string) string {
	path = strings.TrimPrefix(path, "/")
	index := strings.Index(path, "/")
	if index < 0 {
		return path
	}
	return path[:index]
}

// make ws url
// converts http:// to ws://
func MakeWsURL(url string) string {
	url = url[4:]
	url = "ws" + url
	return url
}
