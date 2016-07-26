TaskCluster CLI Client
======================

The taskcluster CLI client installed as `taskcluster` provides a collection of
command line utilities ranging from simple utilities exposing all APIs to
more special case task like signing-in, admin-scripts or creating of loaners.

For a list of all commands run `taskcluster help`, detailed information about
each command is available with `taskcluster help <command>`. Some commands
may even specify additional help for sub-commands using
`taskcluster <command> help <subcommand>`, refer to the individual commands help
text for details.

Development
===========
A command is just an implementation of the `CommandProvider` interface, which
is registered in `func init() {...}` using
`extpoints.Register(name, implememtation)`. Thus, commands are registered as
an import side-effect.

Using the `go-import-subtree` command all sub-packages will be imported in the
top-level `main` package. Hence, commands can be organized in sub-packages as
appropriate, just run `go generate` to ensure they are imported in the
`main` package.
