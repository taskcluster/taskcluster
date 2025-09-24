audience: users
level: patch
reference: issue 7974
---
D2G: fixes `docker: invalid env file (env.list): bufio.Scanner: token too long` error when providing the `docker run` command an `--env-file` that contains a line longer than 64KiB. D2G now passes the variable directly to the run command with `-e <envVarName>=<envVarValue>` to work around this constraint.
