//go:build multiuser

package main

import (
	"errors"
	"maps"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/taskcluster/taskcluster/v117/workers/generic-worker/gwconfig"
	"github.com/taskcluster/taskcluster/v117/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v117/workers/generic-worker/runtime"
)

func TestParseSystemdEnvironment(t *testing.T) {
	output := `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus
DEBUGINFOD_URLS=$'https://debuginfod.debian.net '
QT_IM_MODULES=$'wayland;ibus'
ESCAPED=$'it\'s a "back\\slash"\ttab\nnewline\033[0m caf\303\251'
EMPTY=
not a variable
=no name
BAD=$'unterminated
`
	want := map[string]string{
		"DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus",
		"DEBUGINFOD_URLS":          "https://debuginfod.debian.net ",
		"QT_IM_MODULES":            "wayland;ibus",
		"ESCAPED":                  "it's a \"back\\slash\"\ttab\nnewline\x1b[0m café",
		"EMPTY":                    "",
	}
	if got := parseSystemdEnvironment(output); !maps.Equal(got, want) {
		t.Errorf("got  %#v\nwant %#v", got, want)
	}
}

// fakeDesktopSession makes waitForDesktopSessionEnv read the session
// environment from read, for the duration of the test.
func fakeDesktopSession(t *testing.T, read func(string) (map[string]string, error)) {
	t.Helper()
	oldRead, oldTimeout, oldInterval, oldEnv := readDesktopSessionEnv, desktopSessionTimeout, desktopSessionPollInterval, desktopSessionEnv
	t.Cleanup(func() {
		readDesktopSessionEnv, desktopSessionTimeout, desktopSessionPollInterval, desktopSessionEnv = oldRead, oldTimeout, oldInterval, oldEnv
	})
	readDesktopSessionEnv = read
	desktopSessionTimeout, desktopSessionPollInterval = 50*time.Millisecond, time.Millisecond
	desktopSessionEnv = nil
}

func TestWaitForDesktopSessionEnv(t *testing.T) {
	calls := 0
	fakeDesktopSession(t, func(string) (map[string]string, error) {
		calls++
		switch calls {
		case 1:
			return nil, errors.New("user manager not running yet")
		case 2:
			// WAYLAND_DISPLAY not published yet
			return map[string]string{"XDG_SESSION_TYPE": "wayland", "DISPLAY": ":0"}, nil
		}
		return map[string]string{"XDG_SESSION_TYPE": "wayland", "DISPLAY": ":0", "WAYLAND_DISPLAY": "wayland-0", "HOME": "/home/x"}, nil
	})
	if err := waitForDesktopSessionEnv("task_123"); err != nil {
		t.Fatal(err)
	}
	want := map[string]string{"XDG_SESSION_TYPE": "wayland", "DISPLAY": ":0", "WAYLAND_DISPLAY": "wayland-0"}
	if calls != 3 || !maps.Equal(desktopSessionEnv, want) {
		t.Errorf("after %v calls got %v, want %v", calls, desktopSessionEnv, want)
	}
}

func TestWaitForDesktopSessionEnvTimeout(t *testing.T) {
	fakeDesktopSession(t, func(string) (map[string]string, error) {
		return map[string]string{"XDG_SESSION_TYPE": "wayland", "DISPLAY": ":0"}, nil
	})
	err := waitForDesktopSessionEnv("task_123")
	if err == nil || !strings.Contains(err.Error(), "did not set WAYLAND_DISPLAY") || !strings.Contains(err.Error(), "XDG_SESSION_TYPE:wayland") {
		t.Fatalf("got error %v", err)
	}
	if desktopSessionEnv != nil {
		t.Errorf("session environment should not have been stored: %v", desktopSessionEnv)
	}
}

func TestDesktopSessionEnvPrecedence(t *testing.T) {
	fakeDesktopSession(t, nil)
	desktopSessionEnv = map[string]string{"DISPLAY": ":1", "WAYLAND_DISPLAY": "wayland-0", "XDG_SESSION_TYPE": "wayland"}
	oldConfig := config
	t.Cleanup(func() { config = oldConfig })
	config = &gwconfig.Config{}
	task := &TaskRun{
		TaskID: "task-id",
		Payload: GenericWorkerPayload{Env: map[string]string{
			"XDG_SESSION_TYPE": "x11",          // overrides session value
			"XDG_RUNTIME_DIR":  "/tmp/runtime", // can't be overridden
		}},
		Context: &TaskContext{User: &gwruntime.OSUser{Name: "task_123"}},
		pd:      &process.PlatformData{SysProcAttr: &syscall.SysProcAttr{Credential: &syscall.Credential{Uid: 1234}}},
	}
	env := map[string]string{}
	for _, kv := range task.EnvVars() {
		name, value, _ := strings.Cut(kv, "=")
		env[name] = value
	}
	for name, value := range map[string]string{"DISPLAY": ":1", "WAYLAND_DISPLAY": "wayland-0", "XDG_SESSION_TYPE": "x11", "XDG_RUNTIME_DIR": "/run/user/1234"} {
		if env[name] != value {
			t.Errorf("%v: got %q, want %q", name, env[name], value)
		}
	}
}
