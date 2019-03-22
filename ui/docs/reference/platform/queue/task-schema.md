---
layout:       default
class:        html
docson:       true
marked:       true
ejs:          true
superagent:   true
docref:       true
title:        "Task Schema"
order: 100
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

# Task Definition

The following is the JSON schema for a task definition:

<SchemaTable schema="/schemas/queue/v1/create-task-request.json" />
