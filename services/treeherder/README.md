TaskCluster - TreeHerder Integration
====================================

This component will post events from task-graphs and their tasks to treeherder
provided that:
  * The task-graph routing key is prefix `treeherder-reporting.`
  * The task-graph carries the following tags:
    - `treeherderComment`
    - `treeherderRevision`
    - `treeherderRepository`
  * All tasks (to be posted) carries tag tags:
   - `treeherderSymbol`
   - `treeherderGroupName`
   - `treeherderGroupSymbol`
   - `treeherderProductName`


Note, the task-graph routing key prefix is configurable, but in production we
shall use `treeherder-reporting`, with a dot added if it's followed by other
routing keys.



How this works:
 - task-graphs with: extra.treeherder and route.treeherder
    - will get result-set created on treeherder
 - tasks with: extra.treeherder and route.treeherder
    - will be created in result-set on treeherder
    - will have state reported to treeherder

By only adding route.treeherder to tasks, you can append tasks to an existing
treeherder result-set created by for example build-bot.


task.extra.
  symbol
  groupName
  groupSymbol
  productName
