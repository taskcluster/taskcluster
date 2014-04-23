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
