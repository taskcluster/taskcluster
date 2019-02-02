package main

import (
	"encoding/json"
	"net"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/taskcluster/generic-worker/gwconfig"
)

func TestMissingIPConfig(t *testing.T) {
	file := filepath.Join("testdata", "config", "noip.json")
	const setting = "publicIP"
	config, err := loadConfig(file, false, false)
	if err != nil {
		t.Fatalf("%v", err)
	}
	err = config.Validate()
	if err == nil {
		t.Fatal("Was expecting to get an error back, but didn't get one!")
	}
	switch typ := err.(type) {
	case gwconfig.MissingConfigError:
		if typ.Setting != setting {
			t.Errorf("Error message references the wrong missing setting:\n%s\n\nExpected missing setting %q not %q", typ, setting, typ.Setting)
		}
	default:
		t.Fatalf("Was expecting an error of type gwconfig.MissingConfigError but received error of type %T", err)
	}
}

func TestValidConfig(t *testing.T) {
	file := filepath.Join("testdata", "config", "valid.json")
	const ipaddr = "2.1.2.1"
	const workerType = "some-worker-type"
	config, err := loadConfig(file, false, false)
	if err != nil {
		t.Fatalf("%v", err)
	}
	err = config.Validate()
	if err != nil {
		t.Fatalf("Config should pass validation, but get:\n%s", err)
	}
	if actualIP := config.PublicIP.String(); actualIP != ipaddr {
		t.Fatalf("Was expecting IP address %s but received IP address %s", ipaddr, actualIP)
	}
	if actualWorkerType := config.WorkerType; actualWorkerType != workerType {
		t.Fatalf("Was expecting worker type %s but received worker type %s", workerType, actualWorkerType)
	}
}

func TestInvalidIPConfig(t *testing.T) {
	file := filepath.Join("testdata", "config", "invalid-ip.json")
	_, err := loadConfig(file, false, false)
	if err == nil {
		t.Fatal("Was expecting to get an error back due to an invalid IP address, but didn't get one!")
	}
	switch err.(type) {
	case *net.ParseError:
		// all ok
	default:
		t.Fatalf("Was expecting an error of type *net.ParseError but received error of type %T", err)
	}
}

func TestInvalidJsonConfig(t *testing.T) {
	file := filepath.Join("testdata", "config", "invalid-json.json")
	_, err := loadConfig(file, false, false)
	if err == nil {
		t.Fatal("Was expecting to get an error back due to an invalid JSON config, but didn't get one!")
	}
	switch err.(type) {
	case *json.SyntaxError:
		// all ok
	default:
		t.Fatalf("Was expecting an error of type *json.SyntaxError but received error of type %T", err)
	}
}

func TestMissingConfigFile(t *testing.T) {
	file := filepath.Join("testdata", "config", "non-existent-json.json")
	config, err := loadConfig(file, false, false)
	if err != nil {
		t.Fatalf("%v", err)
	}
	err = config.Validate()
	if err == nil {
		t.Fatal("Was expecting to get an error back due to an invalid IP address, but didn't get one!")
	}
	switch err.(type) {
	case gwconfig.MissingConfigError:
		// all ok
	default:
		t.Fatalf("Was expecting an error of type gwconfig.MissingConfigError but received error of type %T", err)
	}
}

func TestWorkerTypeMetadata(t *testing.T) {
	file := filepath.Join("testdata", "config", "worker-type-metadata.json")
	config, err := loadConfig(file, false, false)
	if err != nil {
		t.Fatalf("%v", err)
	}
	err = config.Validate()
	if err != nil {
		t.Fatalf("Config should pass validation, but get:\n%s", err)
	}
	// loadConfig function specifies a value, let's check we can't override it in the config file ("fakeos")
	if config.WorkerTypeMetadata["generic-worker"].(map[string]interface{})["go-os"] != runtime.GOOS {
		t.Fatalf("Was not expecting key 'go-os' from file worker-type-metadata.json to override default value\n%#v", config)
	}
	// go-version not specified in config file, but should be set in loadConfig, let's check it is
	if config.WorkerTypeMetadata["generic-worker"].(map[string]interface{})["go-version"] != runtime.Version() {
		t.Fatalf("Was expecting key 'go-version' to be set to go version in worker type metadata\n%#v", config)
	}
	// machine-setup is not set in loadConfig, but is set in config file, let's check we have it
	if config.WorkerTypeMetadata["machine-setup"].(map[string]interface{})["script"] != "https://raw.githubusercontent.com/taskcluster/generic-worker/2d2ad3000787f2c893299e693ea3f59287127f5c/worker_types/win2012r2/userdata" {
		t.Fatalf("Was expecting machine-setup to be set properly\n%#v", config)
	}
}

func TestBoolAsString(t *testing.T) {
	file := filepath.Join("testdata", "config", "bool-as-string.json")
	_, err := loadConfig(file, false, false)
	if err == nil {
		t.Fatal("Was expecting to get an error back due to a bool being specified as a string, but didn't get one!")
	}
	switch err.(type) {
	case *json.UnmarshalTypeError:
		// all ok
	default:
		t.Fatalf("Was expecting an error of type *json.UnmarshalTypeError but received error of type %T", err)
	}
}
