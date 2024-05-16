package codegen

import (
	"github.com/iancoleman/strcase"
	"github.com/taskcluster/taskcluster/v65/clients/client-shell/apis/definitions"
)

type manifest struct {
	References []string `json:"references"`
}

type withSchema struct {
	Schema string `json:"$schema"`
}

type schema struct {
	Metadata metadata `json:"metadata"`
}

type metadata struct {
	Name    string `json:"name"`
	Version int    `json:"version"`
}

func Generate(references *References, gen *Generator) error {
	gen.Print("//go:generate go run ../codegen/cmd/gen-services\n")
	gen.Print("// Code generated by `go generate ./apis`; DO NOT EDIT\n")
	gen.Print("package apis\n")
	gen.Print("\n")
	gen.Print("import \"github.com/taskcluster/taskcluster/v65/clients/client-shell/apis/definitions\"\n")
	gen.Print("\n")

	var manifest manifest
	err := references.get("references/manifest.json", &manifest)
	if err != nil {
		return err
	}

	services := map[string]definitions.Service{}

	for _, refName := range manifest.References {
		// fetch the reference file, just getting its $schema property to start
		var ws withSchema
		err = references.get(refName, &ws)
		if err != nil {
			return err
		}

		// fetch that schema..
		var sch schema
		err = references.get(ws.Schema[:len(ws.Schema)-1], &sch)
		if err != nil {
			return err
		}

		// and check its name and version; we only recognize api references at v0
		if sch.Metadata.Name != "api" || sch.Metadata.Version != 0 {
			continue
		}

		var svc definitions.Service
		err = references.get(refName, &svc)
		if err != nil {
			return err
		}

		camelName := strcase.ToCamel(svc.ServiceName)
		services[camelName] = svc
	}

	gen.Print("var services = ")
	gen.PrettyPrint(services)
	gen.Print("\n")

	return nil
}
