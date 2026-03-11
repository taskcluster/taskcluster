package fileutil

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestAbsFrom(t *testing.T) {
	tests := []struct {
		name     string
		parent   string
		path     string
		expected string
	}{
		{
			name:     "relative path is joined with parent",
			parent:   "/home/worker/tasks/task_1234",
			path:     "generic-worker/live_backing.log",
			expected: "/home/worker/tasks/task_1234/generic-worker/live_backing.log",
		},
		{
			name:     "absolute path is returned as-is",
			parent:   "/home/worker/tasks/task_1234",
			path:     "/tmp/output.log",
			expected: "/tmp/output.log",
		},
		{
			name:     "dot-relative path is joined with parent",
			parent:   "/home/worker/tasks/task_1234",
			path:     "./subdir/file.txt",
			expected: "/home/worker/tasks/task_1234/subdir/file.txt",
		},
		{
			name:     "bare filename is joined with parent",
			parent:   "/home/worker/tasks/task_1234",
			path:     "file.txt",
			expected: "/home/worker/tasks/task_1234/file.txt",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Skip tests with Unix paths on Windows
			if runtime.GOOS == "windows" && tc.expected[0] == '/' {
				t.Skip("skipping Unix path test on Windows")
			}
			got := AbsFrom(tc.parent, tc.path)
			expected := filepath.FromSlash(tc.expected)
			if got != expected {
				t.Errorf("AbsFrom(%q, %q) = %q, want %q", tc.parent, tc.path, got, expected)
			}
		})
	}
}
