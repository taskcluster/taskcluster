package model

import (
	"fmt"
	"sort"
	"strings"

	"github.com/taskcluster/taskcluster-client-go/text"
)

//////////////////////////////////////////////////////////////////
//
// From: http://schemas.taskcluster.net/base/v1/api-reference.json
//
//////////////////////////////////////////////////////////////////

type API struct {
	Version     interface{} `json:"version"`
	Schema      string      `json:"$schema"`
	Title       string      `json:"title"`
	Description string      `json:"description"`
	BaseURL     string      `json:"baseUrl"`
	Entries     []APIEntry  `json:"entries"`

	apiDef *APIDefinition
}

func (api *API) String() string {
	var result string = fmt.Sprintf(
		"Version     = '%v'\n"+
			"Schema      = '%v'\n"+
			"Title       = '%v'\n"+
			"Description = '%v'\n"+
			"Base URL    = '%v'\n",
		api.Version, api.Schema, api.Title, api.Description, api.BaseURL,
	)
	for i, entry := range api.Entries {
		result += fmt.Sprintf("Entry %-6v=\n%v", i, entry.String())
	}
	return result
}

func (api *API) postPopulate(apiDef *APIDefinition) {

	// make sure each entry defined for this API has a unique generated method name
	methods := make(map[string]bool)

	for i := range api.Entries {
		api.Entries[i].Parent = api
		api.Entries[i].MethodName = text.GoTypeNameFrom(api.Entries[i].Name, methods)
		api.Entries[i].postPopulate(apiDef)
	}
}

func (api *API) generateAPICode(apiName string) string {
	// package name and variable name are ideally not the same
	// so find a way to make them different...
	// also don't allow type variable name to be the same as
	// the type name
	// e.g. switch case of first character, and if first
	// character is not can't switch case for whatever
	// reason, prefix variable name with "my"
	exampleVarName := api.apiDef.ExampleVarName
	exampleCall := ""
	// here we choose an example API method to call, just the first one in the list of api.Entries
	// We need to first see if it returns one or two variables...
	if api.Entries[0].Output == "" {
		exampleCall = "//  callSummary, err := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)"
	} else {
		exampleCall = "//  data, callSummary, err := " + exampleVarName + "." + api.Entries[0].MethodName + "(.....)"
	}
	comment := ""
	if api.Description != "" {
		comment = text.Indent(api.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += "//\n"
	comment += fmt.Sprintf("// See: %v\n", api.apiDef.DocRoot)
	comment += "//\n"
	comment += "// How to use this package\n"
	comment += "//\n"
	comment += "// First create " + text.IndefiniteArticle(api.apiDef.Name) + " " + api.apiDef.Name + " object:\n"
	comment += "//\n"
	comment += "//  " + exampleVarName + " := " + api.apiDef.PackageName + ".New(&tcclient.Credentials{ClientId: \"myClientId\", AccessToken: \"myAccessToken\"})\n"
	comment += "//\n"
	comment += "// and then call one or more of " + exampleVarName + "'s methods, e.g.:\n"
	comment += "//\n"
	comment += exampleCall + "\n"
	comment += "// handling any errors...\n"
	comment += "//  if err != nil {\n"
	comment += "//  	// handle error...\n"
	comment += "//  }\n"
	comment += "//\n"
	comment += "// TaskCluster Schema\n"
	comment += "//\n"
	comment += "// The source code of this go package was auto-generated from the API definition at\n"
	comment += "// " + api.apiDef.URL + " together with the input and output schemas it references, downloaded on\n"
	comment += "// " + downloadedTime.UTC().Format("Mon, 2 Jan 2006 at 15:04:00 UTC") + ". The code was generated\n"
	comment += "// by https://github.com/taskcluster/taskcluster-client-go/blob/master/build.sh.\n"

	content := comment
	content += "package " + api.apiDef.PackageName + "\n"

	// note: we remove unused imports later, so e.g. if net/url is not used, it
	// will get removed later using:
	// https://godoc.org/golang.org/x/tools/imports

	content += `
import (
	"encoding/json"
	"errors"
	"net/url"
	"time"
	"github.com/taskcluster/taskcluster-client-go/tcclient"
)

type ` + api.apiDef.Name + ` tcclient.ConnectionData

// Returns a pointer to ` + api.apiDef.Name + `, configured to run against production.  If you
// wish to point at a different API endpoint url, set BaseURL to the preferred
// url. Authentication can be disabled (for example if you wish to use the
// taskcluster-proxy) by setting Authenticate to false (in which case creds is
// ignored).
//
`
	content += "// For example:\n"
	content += "//  creds := &tcclient.Credentials{\n"
	content += "//  	ClientId:    os.Getenv(\"TASKCLUSTER_CLIENT_ID\"),\n"
	content += "//  	AccessToken: os.Getenv(\"TASKCLUSTER_ACCESS_TOKEN\"),\n"
	content += "//  	Certificate: os.Getenv(\"TASKCLUSTER_CERTIFICATE\"),\n"
	content += "//  }\n"

	content += "//  " + exampleVarName + " := " + api.apiDef.PackageName + ".New(creds) " + strings.Repeat(" ", 27+len(apiName)-len(api.apiDef.PackageName)) + "  // set credentials\n"
	content += "//  " + exampleVarName + ".Authenticate = false             " + strings.Repeat(" ", len(apiName)) + "           // disable authentication (creds above are now ignored)\n"
	content += "//  " + exampleVarName + ".BaseURL = \"http://localhost:1234/api/" + apiName + "/v1\"   // alternative API endpoint (production by default)\n"
	content += exampleCall + strings.Repeat(" ", 48-len(exampleCall)+len(apiName)+len(exampleVarName)) + " // for example, call the " + api.Entries[0].MethodName + "(.....) API endpoint (described further down)...\n"
	content += "//  if err != nil {\n"
	content += "//  	// handle errors...\n"
	content += "//  }\n"
	content += "func New(credentials *tcclient.Credentials) *" + api.apiDef.Name + " {\n"
	content += "\t" + exampleVarName + " := " + api.apiDef.Name + "(tcclient.ConnectionData{\n"
	content += "\t\tCredentials: credentials,\n"
	content += "\t\tBaseURL: \"" + api.BaseURL + "\",\n"
	content += "\t\tAuthenticate: true,\n"
	content += "\t})\n"
	content += "\treturn &" + exampleVarName + "\n"
	content += "}\n"
	content += "\n"
	for _, entry := range api.Entries {
		content += entry.generateAPICode(apiName)
	}
	return content
}

func (api *API) setAPIDefinition(apiDef *APIDefinition) {
	api.apiDef = apiDef
}

type APIEntry struct {
	Type        string     `json:"type"`
	Method      string     `json:"method"`
	Route       string     `json:"route"`
	Args        []string   `json:"args"`
	Query       []string   `json:"query"`
	Name        string     `json:"name"`
	Stability   string     `json:"stability"`
	Scopes      [][]string `json:"scopes"`
	Input       string     `json:"input"`
	Output      string     `json:"output"`
	Title       string     `json:"title"`
	Description string     `json:"description"`

	MethodName string
	Parent     *API
}

// Add entry.Input and entry.Output to schemaURLs, if they are set
func (entry *APIEntry) postPopulate(apiDef *APIDefinition) {
	for _, v := range []string{
		entry.Input,
		entry.Output,
	} {
		if x := &entry.Parent.apiDef.schemaURLs; v != "" {
			*x = append(*x, v)
		}
	}
}

func (entry *APIEntry) String() string {
	return fmt.Sprintf(
		"    Entry Type        = '%v'\n"+
			"    Entry Method      = '%v'\n"+
			"    Entry Route       = '%v'\n"+
			"    Entry Args        = '%v'\n"+
			"    Entry Query        = '%v'\n"+
			"    Entry Name        = '%v'\n"+
			"    Entry Stability   = '%v'\n"+
			"    Entry Scopes      = '%v'\n"+
			"    Entry Input       = '%v'\n"+
			"    Entry Output      = '%v'\n"+
			"    Entry Title       = '%v'\n"+
			"    Entry Description = '%v'\n",
		entry.Type, entry.Method, entry.Route, entry.Args,
		entry.Query, entry.Name, entry.Stability, entry.Scopes,
		entry.Input, entry.Output, entry.Title, entry.Description,
	)
}

func (entry *APIEntry) generateAPICode(apiName string) string {
	content := entry.generateDirectMethod(apiName)
	if strings.ToUpper(entry.Method) == "GET" {
		content += entry.generateSignedURLMethod(apiName)
	}
	return content
}

func (entry *APIEntry) getInputParamsAndQueryStringCode() (inputParams, queryCode, queryExpr string) {
	inputArgs := append([]string{}, entry.Args...)

	// add optional query parameters
	queryCode = ""
	queryExpr = "nil"
	if len(entry.Query) > 0 {
		queryExpr = "v"
		sort.Strings(entry.Query)
		queryCode = "v := url.Values{}\n"
		for _, j := range entry.Query {
			inputArgs = append(inputArgs, j)
			queryCode += "v.Add(\"" + j + "\", " + j + ")\n"
		}
	}
	// all input parameters are strings, so if there are any, add the type to show it
	if len(inputArgs) > 0 {
		inputParams += strings.Join(inputArgs, ", ") + " string"
	}
	return
}

func (entry *APIEntry) generateDirectMethod(apiName string) string {
	comment := ""
	if entry.Stability != "stable" {
		comment += "// Stability: *** " + strings.ToUpper(entry.Stability) + " ***\n"
		comment += "//\n"
	}
	if entry.Description != "" {
		comment += text.Indent(entry.Description, "// ")
	}
	if len(comment) >= 1 && comment[len(comment)-1:] != "\n" {
		comment += "\n"
	}
	comment += requiredScopesComment(entry.Scopes)
	comment += "//\n"
	comment += fmt.Sprintf("// See %v/#%v\n", entry.Parent.apiDef.DocRoot, entry.Name)

	inputParams, queryCode, queryExpr := entry.getInputParamsAndQueryStringCode()

	apiArgsPayload := "nil"
	if entry.Input != "" {
		apiArgsPayload = "payload"
		p := "payload *" + entry.Parent.apiDef.schemas.SubSchema(entry.Input).TypeName
		if inputParams == "" {
			inputParams = p
		} else {
			inputParams += ", " + p
		}
	}

	responseType := "(*tcclient.CallSummary, error)"
	if entry.Output != "" {
		responseType = "(*" + entry.Parent.apiDef.schemas.SubSchema(entry.Output).TypeName + ", *tcclient.CallSummary, error)"
	}

	content := comment
	content += "func (" + entry.Parent.apiDef.ExampleVarName + " *" + entry.Parent.apiDef.Name + ") " + entry.MethodName + "(" + inputParams + ") " + responseType + " {\n"
	content += queryCode
	content += "\tcd := tcclient.ConnectionData(*" + entry.Parent.apiDef.ExampleVarName + ")\n"
	if entry.Output != "" {
		content += "\tresponseObject, callSummary, err := (&cd).APICall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + url.QueryEscape(", -1), ">", ") + \"", -1) + "\", new(" + entry.Parent.apiDef.schemas.SubSchema(entry.Output).TypeName + "), " + queryExpr + ")\n"
		content += "\treturn responseObject.(*" + entry.Parent.apiDef.schemas.SubSchema(entry.Output).TypeName + "), callSummary, err\n"
	} else {
		content += "\t_, callSummary, err := (&cd).APICall(" + apiArgsPayload + ", \"" + strings.ToUpper(entry.Method) + "\", \"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + url.QueryEscape(", -1), ">", ") + \"", -1) + "\", nil, " + queryExpr + ")\n"
		content += "\treturn callSummary, err\n"
	}
	content += "}\n"
	content += "\n"
	// can remove any code that added an empty string to another string
	return strings.Replace(content, ` + ""`, "", -1)
}

func (entry *APIEntry) generateSignedURLMethod(apiName string) string {
	// if no required scopes, no reason to provide a signed url
	// method, since no auth is required, so unsigned url already works
	if len(entry.Scopes) == 0 {
		return ""
	}
	comment := "// Returns a signed URL for " + entry.MethodName + ", valid for the specified duration.\n"
	comment += requiredScopesComment(entry.Scopes)
	comment += "//\n"
	comment += fmt.Sprintf("// See %v for more details.\n", entry.MethodName)
	inputParams, queryCode, queryExpr := entry.getInputParamsAndQueryStringCode()
	if inputParams == "" {
		inputParams = "duration time.Duration"
	} else {
		inputParams += ", duration time.Duration"
	}

	content := comment
	content += "func (" + entry.Parent.apiDef.ExampleVarName + " *" + entry.Parent.apiDef.Name + ") " + entry.MethodName + "_SignedURL(" + inputParams + ") (*url.URL, error) {\n"
	content += queryCode
	content += "\tcd := tcclient.ConnectionData(*" + entry.Parent.apiDef.ExampleVarName + ")\n"
	content += "\treturn (&cd).SignedURL(\"" + strings.Replace(strings.Replace(entry.Route, "<", "\" + url.QueryEscape(", -1), ">", ") + \"", -1) + "\", " + queryExpr + ", duration)\n"
	content += "}\n"
	content += "\n"
	// can remove any code that added an empty string to another string
	return strings.Replace(content, ` + ""`, "", -1)
}

func requiredScopesComment(scopes [][]string) string {
	if len(scopes) == 0 {
		return ""
	}
	comment := "//\n"
	comment += "// Required scopes:\n"
	switch len(scopes) {
	case 0:
	case 1:
		comment += "//   * " + strings.Join(scopes[0], ", and\n//   * ") + "\n"
	default:
		lines := make([]string, len(scopes))
		for i, j := range scopes {
			switch len(j) {
			case 0:
			case 1:
				lines[i] = "//   * " + j[0]
			default:
				lines[i] = "//   * (" + strings.Join(j, " and ") + ")"
			}
		}
		comment += strings.Join(lines, ", or\n") + "\n"
	}
	return comment
}
