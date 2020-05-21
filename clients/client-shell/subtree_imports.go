package main

// List all subpackages which implement `taskcluster` commands here, in
// alphabetical order.

import (
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/apis"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/completions"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/config"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/from-now"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/group"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/signin"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/slugid"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/task"
	_ "github.com/taskcluster/taskcluster/v30/clients/client-shell/cmds/version"
)
