package main

import (
	"encoding/json"
	"fmt"
	"go/format"
	"io/ioutil"
	"os"

	got "github.com/taskcluster/go-got"
	"github.com/taskcluster/taskcluster-cli/apis/definitions"
)

func main() {
	g := got.New()

	// Fetch API manifest
	res, err := g.Get("http://references.taskcluster.net/manifest.json").Send()
	if err != nil {
		fmt.Println("Failed to fetch api manifest, error: ", err)
		os.Exit(1)
	}
	// Parse API manifest
	var manifest map[string]string
	if err = json.Unmarshal(res.Body, &manifest); err != nil {
		fmt.Println("Failed to parse api manifest, error: ", err)
		os.Exit(1)
	}

	services := make(map[string]definitions.Service)
	for name, referenceURL := range manifest {
		fmt.Println(" - Fetching", name)
		// Fetch reference
		res, err2 := g.Get(referenceURL).Send()
		if err2 != nil {
			fmt.Println("Failed to fetch API: ", name, " error: ", err2)
			os.Exit(1)
		}
		// Parse reference
		var s definitions.Service
		if err2 := json.Unmarshal(res.Body, &s); err2 != nil {
			fmt.Println("Failed parse API: ", name, " error: ", err2)
			os.Exit(1)
		}
		services[name] = s
	}

	// Fetch all schemas
	fmt.Println("Fetching Schemas:")
	schemas := make(map[string]string)
	fetchSchema := func(url string) {
		if _, ok := schemas[url]; ok {
			return
		}
		fmt.Println(" - ", url)
		res, err2 := g.Get(url).Send()
		if err2 != nil {
			fmt.Println("Failed to fetch: ", url, " error: ", err)
			os.Exit(1)
		}
		// Test that we can parse the JSON schema (otherwise it's invalid)
		var i interface{}
		if json.Unmarshal(res.Body, &i) != nil {
			fmt.Println("Failed to parse: ", url, " error: ", err)
			os.Exit(1)
		}
		schemas[url] = string(res.Body)
	}
	for _, s := range services {
		for _, e := range s.Entries {
			if e.Input != "" {
				fetchSchema(e.Input)
			}
			if e.Output != "" {
				fetchSchema(e.Output)
			}
		}
	}

	code := "package apis\n"
	code += "\n"
	code += "import \"github.com/taskcluster/taskcluster-cli/apis/definitions\"\n"
	code += "\n"
	code += "var services = " + fmt.Sprintf("%#v", services)
	code += "\n"
	code += "var schemas = " + fmt.Sprintf("%#v", schemas)
	code += "\n"

	source, err := format.Source([]byte(code))
	if err != nil {
		fmt.Println("go fmt, code generation failed, error: ", err)
		os.Exit(1)
	}

	if err := ioutil.WriteFile("services.go", source, 0664); err != nil {
		fmt.Println("Failed to save services.go, error: ", err)
		os.Exit(1)
	}
}
