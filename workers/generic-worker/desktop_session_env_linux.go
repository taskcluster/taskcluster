//go:build multiuser

package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/taskcluster/taskcluster/v117/workers/generic-worker/process"
	gwruntime "github.com/taskcluster/taskcluster/v117/workers/generic-worker/runtime"
)

// desktopSessionVars are the variables of the task user's desktop session
// that are passed to task commands on non-headless Linux workers. GNOME
// publishes them to the user's systemd user manager. XDG_RUNTIME_DIR is not
// included, since generic-worker computes it from the task user's uid.
var desktopSessionVars = []string{
	"DISPLAY",
	"WAYLAND_DISPLAY",
	"XAUTHORITY",
	"XDG_SESSION_TYPE",
	"XDG_CURRENT_DESKTOP",
	"XDG_SESSION_DESKTOP",
	"XDG_DATA_DIRS",
	"DBUS_SESSION_BUS_ADDRESS",
}

var (
	desktopSessionTimeout      = 2 * time.Minute
	desktopSessionPollInterval = time.Second
	// replaced in tests
	readDesktopSessionEnv = systemdUserEnvironment
)

// waitForDesktopSessionEnv waits for the desktop session of the logged in
// task user to publish WAYLAND_DISPLAY (or, outside of a Wayland session,
// DISPLAY), and then stores the session's desktopSessionVars in
// desktopSessionEnv. If the session isn't ready in time, the worker can't run
// tasks properly, so an error is returned.
func waitForDesktopSessionEnv(username string) error {
	deadline := time.Now().Add(desktopSessionTimeout)
	for {
		env, err := readDesktopSessionEnv(username)
		session := map[string]string{}
		for _, name := range desktopSessionVars {
			if value, ok := env[name]; ok {
				session[name] = value
			}
		}
		if session["WAYLAND_DISPLAY"] != "" || (session["DISPLAY"] != "" && session["XDG_SESSION_TYPE"] != "wayland") {
			log.Printf("Desktop session environment of task user %v: %v", username, session)
			desktopSessionEnv = session
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("desktop session of task user %v did not set WAYLAND_DISPLAY (or DISPLAY, outside of a Wayland session) within %v; session environment: %v; error: %v",
				username, desktopSessionTimeout, session, err)
		}
		time.Sleep(desktopSessionPollInterval)
	}
}

// systemdUserEnvironment returns the environment of the systemd user manager
// of the given user, by running `systemctl --user show-environment` as them.
func systemdUserEnvironment(username string) (map[string]string, error) {
	pd, err := process.TaskUserPlatformData(&gwruntime.OSUser{Name: username}, false)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	env := []string{
		"PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
		fmt.Sprintf("XDG_RUNTIME_DIR=/run/user/%d", pd.SysProcAttr.Credential.Uid),
	}
	cmd, err := process.NewCommandContext(ctx, []string{"systemctl", "--user", "show-environment"}, "/", env, pd)
	if err != nil {
		return nil, err
	}
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
			err = fmt.Errorf("%w: %s", err, bytes.TrimSpace(exitErr.Stderr))
		}
		return nil, fmt.Errorf("systemctl --user show-environment: %w", err)
	}
	return parseSystemdEnvironment(string(output)), nil
}

// systemd escapes \ and ' with a backslash inside $'...', and writes control
// characters as \n, \t etc. or \ooo, which Go string literals also support.
// This turns the contents of $'...' into the contents of a Go "..." literal.
var systemdQuotingToGo = strings.NewReplacer(`\\`, `\\`, `\'`, `'`, `"`, `\"`)

// parseSystemdEnvironment parses `systemctl show-environment` output: one
// KEY=VALUE per line, with values that need escaping in shell $'...'
// quoting. Lines that can't be parsed are skipped.
func parseSystemdEnvironment(output string) map[string]string {
	env := map[string]string{}
	for line := range strings.Lines(output) {
		name, value, ok := strings.Cut(strings.TrimSuffix(line, "\n"), "=")
		if !ok || name == "" {
			continue
		}
		if body, quoted := strings.CutPrefix(value, "$'"); quoted {
			body, ok = strings.CutSuffix(body, "'")
			unquoted, err := strconv.Unquote(`"` + systemdQuotingToGo.Replace(body) + `"`)
			if !ok || err != nil {
				continue
			}
			value = unquoted
		}
		env[name] = value
	}
	return env
}
