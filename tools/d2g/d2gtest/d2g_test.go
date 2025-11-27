//go:generate go run ../../../workers/generic-worker/gw-codegen file://schemas/test_suites.yml generated_types.go

package d2gtest

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/sergi/go-diff/diffmatchpatch"
	"github.com/xeipuuv/gojsonschema"
	"sigs.k8s.io/yaml"

	"github.com/taskcluster/taskcluster/v94/internal/scopes"
	d2g "github.com/taskcluster/taskcluster/v94/tools/d2g"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/dockerworker"
	"github.com/taskcluster/taskcluster/v94/tools/d2g/genericworker"
)

func ExampleConvertScopes_mixture() {
	dwScopes := []string{
		"foo",
		"bar:dog",
		"cat:docker-worker:feet",
		"docker-worker",
		"docker-worker:monkey",
		"generic-worker:teapot",
		"docker-worker:docker-worker:potato",
		"docker-worker:capability:device:loopbackVideo",
		"docker-worker:capability:device:loopbackVideo:",
		"docker-worker:capability:device:loopbackVideo:x/y/z",
		"docker-worker:capability:device:kvm:x/y/z",
	}
	dwPayload := dockerworker.DockerWorkerPayload{}
	defaults.SetDefaults(&dwPayload)
	gwScopes, err := d2g.ConvertScopes(dwScopes, &dwPayload, "proj-misc/tutorial", scopes.DummyExpander())
	if err != nil {
		fmt.Print(err)
	}
	for _, s := range gwScopes {
		fmt.Printf("\t%#v\n", s)
	}

	// Output:
	//	"bar:dog"
	//	"cat:docker-worker:feet"
	//	"docker-worker"
	//	"docker-worker:capability:device:kvm:x/y/z"
	//	"docker-worker:capability:device:loopbackVideo"
	//	"docker-worker:capability:device:loopbackVideo:"
	//	"docker-worker:capability:device:loopbackVideo:x/y/z"
	//	"docker-worker:docker-worker:potato"
	//	"docker-worker:monkey"
	//	"foo"
	//	"generic-worker:docker-worker:potato"
	//	"generic-worker:loopback-video:"
	//	"generic-worker:loopback-video:*"
	//	"generic-worker:loopback-video:x/y/z"
	//	"generic-worker:monkey"
	//	"generic-worker:os-group:proj-misc/tutorial/docker"
	//	"generic-worker:os-group:x/y/z/kvm"
	//	"generic-worker:os-group:x/y/z/libvirt"
	//	"generic-worker:teapot"
}

type mockedDirEntry struct {
	name string
}

func (m mockedDirEntry) Name() string {
	return m.name
}

func (m mockedDirEntry) IsDir() bool {
	return false
}

func (m mockedDirEntry) Type() os.FileMode {
	return 0666
}

func (m mockedDirEntry) Info() (os.FileInfo, error) {
	return nil, nil
}

func FakeReadDir(name string) ([]os.DirEntry, error) {
	if name == "/dev" {
		return []os.DirEntry{mockedDirEntry{name: "nvidia0"}, mockedDirEntry{name: "nvidiactl"}}, nil
	}
	return os.ReadDir(name)
}

// TestDataTestCases runs all the test cases found in directory testdata/testcases.
func TestDataTestCases(t *testing.T) {
	schema := JSONSchema()
	// Enumerate all test suites under testdata/testcases, and execute a subtest for each suite
	err := filepath.WalkDir(
		"testdata/testcases",
		func(path string, file fs.DirEntry, e error) error {
			if e != nil {
				return e
			}
			if file.IsDir() {
				return nil
			}
			if filepath.Ext(path) != ".yml" {
				t.Logf("Skipping %v", path)
				return nil
			}
			t.Run(
				path,
				testSuite(schema, path),
			)
			return nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
}

// testSuite returns a go test the given testSuite
func testSuite(schema string, path string) func(t *testing.T) {
	return func(t *testing.T) {
		validateTestSuite(t, schema, path)
		// Iterate through test cases in the test suite, and execute a subtest for each test case
		var d D2GTestCases
		defaults.SetDefaults(&d)
		unmarshalYAML(t, &d, path)
		// TODO: check if this works as expected (create explicit test cases for this)
		// setting defaults and unmarshaling a second time
		// because this seems to fix the issue with defaults
		// not being applied to slices
		defaults.SetDefaults(&d)
		unmarshalYAML(t, &d, path)
		for i := range d.TestSuite.PayloadTests {
			tc := &d.TestSuite.PayloadTests[i]
			t.Run(
				tc.Name,
				tc.TestTaskPayloadCase(),
			)
		}
		for i := range d.TestSuite.TaskDefTests {
			tc := &d.TestSuite.TaskDefTests[i]
			t.Run(
				tc.Name,
				tc.TestTaskDefinitionCase(),
			)
		}
		if os.Getenv("D2G_UPDATE_TEST_EXPECTATIONS") != "" {
			marshalYAML(t, d, path)
		}
	}
}

func (tc *TaskPayloadTestCase) TestTaskPayloadCase() func(t *testing.T) {
	return func(t *testing.T) {
		t.Helper()
		tc.Validate(t)
		dwPayload := dockerworker.DockerWorkerPayload{}
		defaults.SetDefaults(&dwPayload)
		err := json.Unmarshal(tc.DockerWorkerTaskPayload, &dwPayload)
		if err != nil {
			t.Fatalf("Cannot unmarshal test suite Docker Worker payload %v: %v", string(tc.DockerWorkerTaskPayload), err)
		}

		d2gConfigBytes, err := json.Marshal(tc.D2GConfig)
		if err != nil {
			t.Fatalf("Cannot marshal test suite D2GConfig: %v", err)
		}
		var d2gConfig d2g.Config
		err = json.Unmarshal(d2gConfigBytes, &d2gConfig)
		if err != nil {
			t.Fatalf("Cannot unmarshal test suite D2GConfig %v: %v", string(d2gConfigBytes), err)
		}
		actualGWPayload, _, err := d2g.ConvertPayload(&dwPayload, d2gConfig, FakeReadDir)
		if err != nil {
			t.Fatalf("Cannot convert Docker Worker payload %#v to Generic Worker payload: %s", dwPayload, err)
		}
		formattedActualGWPayload, err := json.MarshalIndent(*actualGWPayload, "", "  ")
		if err != nil {
			t.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", *actualGWPayload, err)
		}
		gwPayload := genericworker.GenericWorkerPayload{}
		defaults.SetDefaults(&gwPayload)
		err = json.Unmarshal(tc.GenericWorkerTaskPayload, &gwPayload)
		if err != nil {
			t.Fatalf("Cannot unmarshal test suite Generic Worker payload %v: %v", string(tc.GenericWorkerTaskPayload), err)
		}
		formattedExpectedGWPayload, err := json.MarshalIndent(gwPayload, "", "  ")
		if err != nil {
			t.Fatalf("Cannot convert Generic Worker payload %#v to JSON: %s", gwPayload, err)
		}
		if string(formattedExpectedGWPayload) != string(formattedActualGWPayload) {
			dmp := diffmatchpatch.New()
			diff := dmp.DiffMain(string(formattedExpectedGWPayload), string(formattedActualGWPayload), false)
			if os.Getenv("D2G_UPDATE_TEST_EXPECTATIONS") != "" {
				tc.GenericWorkerTaskPayload = formattedActualGWPayload
			}
			t.Fatalf("Converted task does not match expected value.\nDiff:%v", dmp.DiffPrettyText(diff))
		}
	}
}

func (tc *TaskDefinitionTestCase) TestTaskDefinitionCase() func(t *testing.T) {
	return func(t *testing.T) {
		t.Helper()
		tc.Validate(t)
		d2gConfigBytes, err := json.Marshal(tc.D2GConfig)
		if err != nil {
			t.Fatalf("Cannot marshal test suite D2GConfig: %v", err)
		}
		var d2gConfig d2g.Config
		err = json.Unmarshal(d2gConfigBytes, &d2gConfig)
		if err != nil {
			t.Fatalf("Cannot unmarshal test suite D2GConfig %v: %v", string(d2gConfigBytes), err)
		}
		gwTaskDef, err := d2g.ConvertTaskDefinition(tc.DockerWorkerTaskDefinition, d2gConfig, scopes.DummyExpander(), FakeReadDir)
		if err != nil {
			t.Fatalf("cannot convert task definition: %v", err)
		}

		formattedActualGWTaskDef, err := json.MarshalIndent(gwTaskDef, "", "  ")
		if err != nil {
			t.Fatalf("Cannot convert resulting Generic Worker task definition %#v to JSON: %s", gwTaskDef, err)
		}

		formattedExpectedGWTaskDef, err := json.MarshalIndent(tc.GenericWorkerTaskDefinition, "", "  ")
		if err != nil {
			t.Fatalf("Cannot convert expected Generic Worker task definition %#v to JSON: %s", tc.GenericWorkerTaskDefinition, err)
		}

		if string(formattedExpectedGWTaskDef) != string(formattedActualGWTaskDef) {
			dmp := diffmatchpatch.New()
			diff := dmp.DiffMain(string(formattedExpectedGWTaskDef), string(formattedActualGWTaskDef), false)
			if os.Getenv("D2G_UPDATE_TEST_EXPECTATIONS") != "" {
				tc.GenericWorkerTaskDefinition = formattedActualGWTaskDef
			}
			t.Fatalf("Converted task does not match expected value.\nDiff:%v", dmp.DiffPrettyText(diff))
		}
	}
}

func yamlToJSON(t *testing.T, path string) []byte {
	t.Helper()
	yml, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	j, err := yaml.YAMLToJSON(yml)
	if err != nil {
		t.Fatal(err)
	}
	// Takes json []byte input, unmarshals and then marshals, in order to get a
	// canonical representation of json (i.e. formatted with objects ordered).
	// Ugly and perhaps inefficient, but effective! :p
	tmpObj := new(any)
	err = json.Unmarshal(j, &tmpObj)
	if err != nil {
		t.Fatal(err)
	}
	formatted, err := json.MarshalIndent(&tmpObj, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return formatted
}

func unmarshalYAML(t *testing.T, dest any, path string) {
	t.Helper()
	j := yamlToJSON(t, path)
	err := json.Unmarshal(j, dest)
	if err != nil {
		t.Fatal(err)
	}
}

func marshalYAML(t *testing.T, src any, path string) {
	t.Helper()
	j, err := json.Marshal(src)
	if err != nil {
		t.Fatal(err)
	}

	result, err := yaml.JSONToYAML(j)
	if err != nil {
		t.Fatal(err)
	}

	err = os.WriteFile(path, result, 0644)
	if err != nil {
		t.Fatal(err)
	}
}

func validateAgainstSchema(t *testing.T, rm json.RawMessage, schema string) {
	t.Helper()
	documentLoader := gojsonschema.NewBytesLoader(rm)
	schemaLoader := gojsonschema.NewStringLoader(schema)
	result, err := gojsonschema.Validate(schemaLoader, documentLoader)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Valid() {
		t.Logf("The document is not valid:")
		for _, desc := range result.Errors() {
			t.Logf("- %s", desc)
		}
		t.FailNow()
	}
}

func validateTestSuite(t *testing.T, schema string, path string) {
	t.Helper()
	b := yamlToJSON(t, path)
	validateAgainstSchema(t, b, schema)
}

func (tc *TaskPayloadTestCase) Validate(t *testing.T) {
	t.Helper()
	validateAgainstSchema(t, tc.DockerWorkerTaskPayload, dockerworker.JSONSchema())
	validateAgainstSchema(t, tc.GenericWorkerTaskPayload, genericworker.JSONSchema())
}

func (tc *TaskDefinitionTestCase) Validate(t *testing.T) {
	t.Helper()
	var dwRaw json.RawMessage
	var gwRaw json.RawMessage

	var parsedDwTaskDef map[string]any
	err := json.Unmarshal(tc.DockerWorkerTaskDefinition, &parsedDwTaskDef)
	if err != nil {
		t.Fatalf("cannot parse Docker Worker task definition: %v", err)
	}

	dwRaw, err = json.Marshal(parsedDwTaskDef["payload"])
	if err != nil {
		t.Fatalf("Cannot marshal test suite Docker Worker payload %#v: %v", parsedDwTaskDef["payload"], err)
	}

	var parsedGwTaskDef map[string]any
	err = json.Unmarshal(tc.GenericWorkerTaskDefinition, &parsedGwTaskDef)
	if err != nil {
		t.Fatalf("cannot parse Generic Worker task definition: %v", err)
	}

	gwRaw, err = json.Marshal(parsedGwTaskDef["payload"])
	if err != nil {
		t.Fatalf("Cannot marshal test suite Generic Worker payload %#v: %v", parsedGwTaskDef["payload"], err)
	}

	validateAgainstSchema(t, dwRaw, dockerworker.JSONSchema())
	validateAgainstSchema(t, gwRaw, genericworker.JSONSchema())
}
