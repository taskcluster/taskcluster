package apis

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	got "github.com/taskcluster/go-got"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/apis/definitions"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/client"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v94/clients/client-shell/config"
)

var (
	// Command is the root of the api commands.
	Command = &cobra.Command{
		Use:   "api",
		Short: "Direct access to Taskcluster APIs.",
	}
)

func init() {
	for name, service := range services {
		// command for service
		cmd := makeCmdFromDefinition(name, service)
		Command.AddCommand(cmd)
	}

	// flags for the main `api` command
	fs := Command.PersistentFlags()
	fs.StringP("output", "o", "-", "Output file")
	err := Command.MarkPersistentFlagFilename("output")
	if err != nil {
		panic(err)
	}

	root.Command.AddCommand(Command)
}

func makeCmdFromDefinition(name string, service definitions.Service) *cobra.Command {
	// lowercase first letter
	cmdString := strings.ToLower(name[0:1]) + name[1:]

	// cobra command for the service, a subcommand of Command
	cmd := &cobra.Command{
		Use:   cmdString,
		Short: "Operates on the " + name + " service",
		Long:  service.Description,
	}

	// one subcommand for every function of the service
	for _, entry := range service.Entries {
		usage := entry.Name
		for _, arg := range entry.Args {
			usage += " <" + arg + ">"
		}

		subCmd := &cobra.Command{
			Use:   usage,
			Short: entry.Title,
			Long:  buildHelp(&entry),
			RunE:  buildExecutor(service, entry),
		}

		fs := subCmd.Flags()
		for _, q := range entry.Query {
			fs.String(q, "", "Specify the '"+q+"' query-string parameter")
		}

		cmd.AddCommand(subCmd)
	}

	return cmd
}

func buildHelp(entry *definitions.Entry) string {
	buf := &bytes.Buffer{}

	jsonInput := "no"
	if entry.Input != "" {
		jsonInput = "yes"
	}
	fmt.Fprintf(buf, "%s\n", entry.Title)
	fmt.Fprintf(buf, "Method:     %s\n", entry.Method)
	fmt.Fprintf(buf, "Path:       %s\n", entry.Route)
	fmt.Fprintf(buf, "Stability:  %s\n", entry.Stability)
	fmt.Fprintf(buf, "JSON Input: %s\n", jsonInput)
	fmt.Fprintln(buf, "")
	fmt.Fprint(buf, entry.Description)

	return buf.String()
}

func buildExecutor(service definitions.Service, entry definitions.Entry) func(*cobra.Command, []string) error {
	return func(cmd *cobra.Command, args []string) error {
		// validate that we have as much arguments as in the definition
		if len(args) < len(entry.Args) {
			return errors.New("insufficient arguments given")
		}

		// Because cobra doesn't extract the args or map them to their
		// name, we build it ourselves.
		argmap := make(map[string]string)
		for pos, name := range entry.Args {
			argmap[name] = args[pos]
		}

		// Same with the local flags.
		query := make(map[string]string)
		fs := cmd.LocalFlags()
		for _, opt := range entry.Query {
			if val, err := fs.GetString(opt); err == nil {
				if val != "" {
					query[opt] = val
				}
			} else {
				return err
			}
		}

		// Read payload if present
		var input io.Reader = os.Stdin
		if payload, ok := argmap["payload"]; ok {
			if payload != "-" {
				input = bytes.NewBufferString(payload)
			}
		}

		// Setup output
		var output = cmd.OutOrStdout()
		if flag := cmd.Flags().Lookup("output"); flag != nil && flag.Changed {
			filename := flag.Value.String()
			f, err := os.Create(filename)
			if err != nil {
				return fmt.Errorf("failed to open output file, error: %s", err)
			}
			defer f.Close()
			output = f
		}

		return execute(service.ServiceName, service.APIVersion, &entry, argmap, query, input, output)
	}
}

func execute(
	serviceName string, apiVersion string, entry *definitions.Entry, args, query map[string]string,
	payload io.Reader, output io.Writer,
) error {
	var input []byte
	// Read all input
	if entry.Input != "" {
		data, err := readInput(payload)
		if err != nil {
			return err
		}
		input = data
	}

	// Parameterize the route
	route := entry.Route
	for k, v := range args {
		val := url.PathEscape(v)
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
	method := strings.ToUpper(entry.Method)
	url := tcurls.API(config.RootURL(), serviceName, apiVersion, route+q)

	// Try to make the request up to 5 times using go-got
	// Allow unlimited responses.
	g := got.New()
	g.Retries = 5
	g.MaxSize = 0

	// use a custom client that does not follow redirects
	httpClient := *g.Client
	httpClient.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}
	g.Client = &httpClient

	req := g.NewRequest(method, url, input)

	// If there is a body, we set a content-type
	if len(input) != 0 {
		req.Header.Set("Content-Type", "application/json")
	}

	// Sign request if credentials are available
	if config.Credentials != nil {
		var h hash.Hash
		// Create payload hash if there is any
		if len(input) != 0 {
			h = client.PayloadHash("application/json")
			_, err := h.Write(input)
			if err != nil {
				return fmt.Errorf("failed to write hash, error: %s", err)
			}
		}
		err := config.Credentials.SignGotRequest(req, h)
		if err != nil {
			return fmt.Errorf("failed to sign request, error: %s", err)
		}
	}

	res, err := req.Send()
	if err != nil {
		// Got considers redirects an error, but we would like to read the body as if it
		// was success, so ignore such errors
		if brcerr, ok := err.(got.BadResponseCodeError); ok {
			if brcerr.StatusCode < 400 {
				res = brcerr.Response
				err = nil
			}
		}
	}
	if err != nil {
		return formatGotError(err)
	}

	// Print the request to whatever output
	_, err = output.Write(res.Body)
	if err != nil {
		return fmt.Errorf("failed to print response: %s", err)
	}

	// Exit
	return nil
}

// Format an error from Got appropriately, breaking out Taskcluster-specific
// information if possible.
func formatGotError(err error) error {
	if res, ok := err.(got.BadResponseCodeError); ok {
		if strings.HasPrefix(res.Header.Get("Content-Type"), "application/json") {
			var body map[string]any
			if json.Unmarshal(res.Body, &body) == nil {
				if message, ok := body["message"]; ok {
					if code, ok := body["code"]; ok {
						return fmt.Errorf("API Error %d: %s\n%s", res.StatusCode, code, message)
					}
				}
			}
		}
	}
	return fmt.Errorf("request failed: %s", err)
}

// Read the input from the given reader; if nothing happens for a few seconds and the input is stdin, then
// write a friendly message to stderr in case the user has forgotten they need to provide input.
func readInput(payload io.Reader) ([]byte, error) {
	// set up to issue a warning after 1s
	timeout := time.After(1 * time.Second)
	done := make(chan bool)
	defer func() { close(done) }()
	go func() {
		select {
		case <-timeout:
			if payload == os.Stdin {
				fmt.Fprintf(os.Stderr, "..waiting for request payload on stdin\n")
			}
		case <-done:
		}
	}()

	data, err := io.ReadAll(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to read input, error: %s", err)
	}
	return data, nil
}
