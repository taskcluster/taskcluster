package apis

import (
	"bytes"
	"errors"
	"fmt"
	"hash"
	"io"
	"io/ioutil"
	"net/url"
	"os"
	"strings"

	"github.com/spf13/cobra"
	got "github.com/taskcluster/go-got"

	tcurls "github.com/taskcluster/taskcluster-lib-urls"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/apis/definitions"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/client"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/root"
	"github.com/taskcluster/taskcluster/v30/clients/client-shell/config"
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
			return errors.New("Insufficient arguments given")
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
				return fmt.Errorf("Failed to open output file, error: %s", err)
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
		data, err := ioutil.ReadAll(payload)
		if err != nil {
			return fmt.Errorf("Failed to read input, error: %s", err)
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
	method := strings.ToUpper(entry.Method)
	url := tcurls.API(config.RootURL(), serviceName, apiVersion, route+q)

	// Try to make the request up to 5 times using go-got
	// Allow unlimited responses.
	g := got.New()
	g.Retries = 5
	g.MaxSize = 0

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
				return fmt.Errorf("Failed to write hash, error: %s", err)
			}
		}
		err := config.Credentials.SignGotRequest(req, h)
		if err != nil {
			return fmt.Errorf("Failed to sign request, error: %s", err)
		}
	}

	res, err := req.Send()
	if err != nil {
		return fmt.Errorf("Request failed: %s", err)
	}

	// Print the request to whatever output
	_, err = output.Write(res.Body)
	if err != nil {
		return fmt.Errorf("Failed to print response: %s", err)
	}

	// Exit
	return nil
}
