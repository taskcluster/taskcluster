# DB 

The Taskcluster DB is implemented in the `db/` directory of this repository.
When we have a good reason to not follow the best practices in the db, we document why.

## Redefining DB Functions 

To redefine a DB function, append `_{2, N}` to the method. For example, redefining `get_widgets` will involve creating
`get_widgets_2`. Note that sometimes it's ok to rename the function instead of appending `_{2, N}`.
Use your own discretion.

---

Did you find a place in the DB where some of the guidelines are not followed?
[File an issue](https://github.com/taskcluster/taskcluster/issues/new/).
Bonus points for sending a pull-request to close the issue :-)
