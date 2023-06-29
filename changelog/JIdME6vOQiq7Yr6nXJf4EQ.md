audience: users
level: minor

---

This change adds the `d2g` subcommand to the `taskcluster` cli.

It can be used to translate a Docker Worker payload to a Generic Worker payload.
Both the input and output are JSON. You can either pass the input as a file or pipe it in to the command.

View help with:

```shell
taskcluster d2g -h
```

Example usages:

```shell
taskcluster d2g -f /path/to/input.json
```

_OR_

```shell
taskcluster d2g --file /path/to/input.json
```

_OR_

```shell
cat /path/to/input.json | taskcluster d2g
```

_OR_

```shell
echo '{"image": "ubuntu", "command": ["bash", "-c", "echo hello world"], "maxRunTime": 300}' | taskcluster d2g
```
