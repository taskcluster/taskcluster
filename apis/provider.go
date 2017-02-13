package apis

import (
	"bytes"
	"fmt"
	"hash"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"strings"

	"github.com/taskcluster/taskcluster-cli/apis/definitions"
	"github.com/taskcluster/taskcluster-cli/client"
	"github.com/taskcluster/taskcluster-cli/extpoints"
	"github.com/xeipuuv/gojsonschema"
)

type apiProvider struct {
	definitions.Service
	Name string
}

func (p apiProvider) ConfigOptions() map[string]extpoints.ConfigOption {
	return map[string]extpoints.ConfigOption{
		"baseUrl": extpoints.ConfigOption{
			Default: p.BaseURL,
			Env:     "TASKCLUSTER_QUEUE_BASE_URL",
			Validate: func(value interface{}) error {
				return nil
			},
		},
	}
}

func (p apiProvider) Summary() string {
	return "Operate on the " + p.Name + " service"
}

func pad(s string, length int) string {
	p := length - len(s)
	if p < 0 {
		p = 0
	}
	return s + strings.Repeat(" ", p)
}

func (p apiProvider) Usage() string {
	query := []string{}
	usage := p.Title + "\n\n"
	usage += "Usage:\n"
	for _, e := range p.Entries {
		args := ""
		for _, arg := range e.Args {
			args += " <" + arg + ">"
		}
		usage += fmt.Sprintf("  taskcluster %s [options] %s", p.Name, e.Name)
		if args != "" {
			usage += " [--]" + args
		}
		for _, q := range e.Query {
			usage += fmt.Sprintf(" [--%s <%s>]", q, q)
			// Add q to opts, if not already in the list
			unique := true
			for _, o := range query {
				if o == q {
					unique = false
				}
			}
			if unique {
				query = append(query, q)
			}
		}
		if e.Input != "" {
			usage += " <payload>"
		}
		usage += "\n"
	}
	usage += fmt.Sprintf("  taskcluster %s help <method>", p.Name)
	usage += "\n\n"
	usage += "Options:\n"
	opts := [][]string{
		[]string{"-o, --output <output>", "Output file [default: -]"},
		[]string{"-b, --base-url <baseUrl>", fmt.Sprintf("BaseUrl for %s [default: %s]", p.Name, p.BaseURL)},
		[]string{"-d, --dry-run", "Validate input again schema without making a request"},
	}
	for _, opt := range query {
		opts = append(opts, []string{
			"    --" + opt + " <" + opt + ">",
			"Specify the '" + opt + "' query-string parameter",
		})
	}
	// Find max option size to align all options
	maxSize := 0
	for _, opt := range opts {
		if len(opt[0]) > maxSize {
			maxSize = len(opt[0])
		}
	}
	for _, opt := range opts {
		usage += "  " + pad(opt[0], maxSize+2) + opt[1] + "\n"
	}
	usage += "\n"
	usage += p.Description
	usage += "\n"

	return usage
}

func (p apiProvider) Execute(context extpoints.Context) bool {
	argv := context.Arguments

	// Find then entry if possible
	var entry *definitions.Entry
	for _, e := range p.Entries {
		if argv[e.Name].(bool) {
			entry = &e
			break
		}
	}
	// Print help information about the end-point
	if entry == nil {
		if !argv["help"].(bool) {
			// Internal error
			panic("Unknown command, internal error!")
		}
		// Print help
		method := argv["<method>"].(string)
		for _, e := range p.Entries {
			if e.Name == method {
				entry = &e
			}
		}
		if entry == nil {
			fmt.Fprintf(os.Stderr, "Unknown method: '%s'\n", method)
		}
		p.help(entry)
		return true
	}

	// Read payload
	var input io.Reader
	if payload, ok := argv["<payload>"].(string); ok {
		if payload == "-" {
			input = os.Stdin
		} else {
			input = bytes.NewBufferString(payload)
		}
	}

	// Setup output
	var output io.Writer = os.Stdout
	if out := argv["--output"].(string); out != "-" {
		f, err := os.Create(out)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to open output file, error: %s\n", err)
			return false
		}
		defer f.Close()
		output = f
	}

	// Construct arguments
	args := make(map[string]string)
	for _, arg := range entry.Args {
		args[arg] = argv["<"+arg+">"].(string)
	}

	// Construct query
	query := make(map[string]string)
	for _, opt := range entry.Query {
		query[opt] = argv["--"+opt].(string)
	}

	// Do a dry run
	if argv["--dry-run"].(bool) {
		return p.dryrun(entry, args, query, input, output)
	}

	// Find baseURL
	baseURL := context.Config["baseUrl"].(string)
	if s, ok := argv["--base-url"].(string); ok {
		baseURL = s
	}

	// Execute method
	return p.execute(baseURL, entry, context, args, query, input, output)
}

func (p apiProvider) help(entry *definitions.Entry) {
	fmt.Printf("%s\n", entry.Title)
	fmt.Printf("Method:    %s\n", entry.Method)
	fmt.Printf("BaseUrl:   %s\n", p.BaseURL)
	fmt.Printf("Path:      %s\n", entry.Route)
	fmt.Printf("Stability: %s\n", entry.Stability)
	fmt.Printf("Scopes:\n")
	for i, scopes := range entry.Scopes {
		fmt.Printf("  %s", strings.Join(scopes, ","))
		if i == len(scopes) {
			fmt.Printf(", or")
		}
		fmt.Println("")
	}
	fmt.Println(entry.Description)
}

func (p apiProvider) dryrun(
	entry *definitions.Entry, args, query map[string]string,
	payload io.Reader, output io.Writer,
) bool {
	// If there is no schema, there is nothing to validate
	schema, ok := schemas[entry.Input]
	if !ok {
		return true
	}

	// Read all input
	data, err := ioutil.ReadAll(payload)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read input, error: %s\n", err)
	}
	input := gojsonschema.NewStringLoader(string(data))

	// Validate against input schema
	result, err := gojsonschema.Validate(
		gojsonschema.NewStringLoader(schema), input,
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Validation failed, error: %s\n", err)
		return false
	}

	// Print all validation errors
	for _, e := range result.Errors() {
		fmt.Fprintf(os.Stderr, " - %s\n", e.Description())
	}

	return result.Valid()
}

func (p apiProvider) execute(
	baseURL string, entry *definitions.Entry, context extpoints.Context,
	args, query map[string]string, payload io.Reader, output io.Writer,
) bool {
	var input []byte
	// Read all input
	if entry.Input != "" {
		data, err := ioutil.ReadAll(payload)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to read input, error: %s\n", err)
		}
		input = data
	}

	// Parameterize the route
	route := entry.Route
	for k, v := range args {
		val := strings.Replace(url.QueryEscape(v), "+", "%20", -1)
		route = strings.Replace(route, "<"+k+">", val, 1)
	}

	// Create query options
	qs := make(url.Values)
	for k, v := range query {
		qs.Add(k, v)
	}
	q := qs.Encode()
	if q != "" {
		q = "?" + q
	}

	// Construct parameters
	var method = strings.ToUpper(entry.Method)
	var url = baseURL + route + q
	var body io.Reader
	if len(input) > 0 {
		body = bytes.NewReader(input)
	}

	// Try to make the request up to 5 times
	var err error
	var res *http.Response
	for i := 0; i < 5; i++ {

		// New request
		req, err2 := http.NewRequest(method, url, body)
		if err2 != nil {
			panic(fmt.Sprintf("Internal error constructing request, error: %s", err))
		}

		// If there is a body, we set a content-type
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}

		// Sign request if credentials are available
		if context.Credentials != nil {
			var h hash.Hash
			// Create payload hash if there is any
			if body != nil {
				h = client.PayloadHash("application/json")
				h.Write(input)
			}
			err2 := context.Credentials.SignRequest(req, h)
			if err2 != nil {
				fmt.Fprintf(os.Stderr, "Failed to sign request, error: %s\n", err2)
				return false
			}
		}

		// Send request
		res, err = http.DefaultClient.Do(req)
		// If error or 5xx we retry
		if err != nil && res.StatusCode/100 == 5 {
			continue
		}
		break
	}
	// Handle request errors
	if err != nil {
		fmt.Fprintf(os.Stderr, "Request failed\n")
		return false
	}

	// Print the request to whatever output
	defer res.Body.Close()
	_, err = io.Copy(output, res.Body)

	// Exit
	return err == nil && res.StatusCode/100 == 2
}
