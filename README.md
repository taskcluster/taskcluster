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

Building
========

Getting the source is as simple as running the following command in your shell.
Go will download the source and set up the repository in your `$GOPATH`.

```
go get -d github.com/taskcluster/taskcluster-cli
```

To actually build the application, simply run `make` in
`$GOPATH/github.com/taskcluster/taskcluster-cli` which will generate the
executable `taskcluster` in the root of the source.

Development
===========

A command is just an implementation of the `CommandProvider` interface, which
is registered in `func init() {...}` using `extpoints.Register(name,
implememtation)`. Thus, commands are registered as an import side-effect.
Commands are implemented in sub-packages.

To add a new command, create a new sub-package and add an import for that
sub-package to `subtree_import.go`, keeping the imports in order.
