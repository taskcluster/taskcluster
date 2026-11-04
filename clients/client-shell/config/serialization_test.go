package config

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

// v2Config is a configuration file as written by the yaml.v2 package, which
// was used to write configuration files before the switch to yaml/v3.
const v2Config = `config:
  authorizedScopes:
  - queue:create-task:*
  - secrets:get:project/foo
  clientId: mozilla-auth0/ad|Mozilla-LDAP|someone/cli
  rootUrl: https://tc.example.com
`

func TestLoadV2Config(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", dir)
	if err := os.WriteFile(filepath.Join(dir, "taskcluster.yml"), []byte(v2Config), 0600); err != nil {
		t.Fatal(err)
	}

	got, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"rootUrl":          "https://tc.example.com",
		"clientId":         "mozilla-auth0/ad|Mozilla-LDAP|someone/cli",
		"authorizedScopes": []any{"queue:create-task:*", "secrets:get:project/foo"},
	}
	if !reflect.DeepEqual(got["config"], want) {
		t.Errorf("Load() config = %#v, want %#v", got["config"], want)
	}
}

func TestSaveConfigPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix file permissions not supported on windows")
	}

	dir := filepath.Join(t.TempDir(), "xdgconfig")
	t.Setenv("XDG_CONFIG_HOME", dir)
	configFile := filepath.Join(dir, "taskcluster.yml")

	check := func() {
		t.Helper()

		if err := Save(map[string]map[string]any{}); err != nil {
			t.Fatal(err)
		}

		di, err := os.Stat(dir)
		if err != nil {
			t.Fatal(err)
		}
		if perm := di.Mode().Perm(); perm != 0700 {
			t.Errorf("config dir permissions = %o, want 700", perm)
		}

		fi, err := os.Stat(configFile)
		if err != nil {
			t.Fatal(err)
		}
		if perm := fi.Mode().Perm(); perm != 0600 {
			t.Errorf("config file permissions = %o, want 600", perm)
		}
	}

	check()
	if err := os.Chmod(configFile, 0664); err != nil {
		t.Fatal(err)
	}
	check()
}
