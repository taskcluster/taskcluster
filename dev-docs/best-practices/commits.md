# Creating Good Commit Messages

Having a well-crafted commit message will save you from using many tools to inspect changes
in a project. Proper commit messages will make it easy to understand why a
change was made at a particular time. This page explains the approach we recommend using in
commit messages.

## Format of the commit message
The format of a commit message can be separated in three distinct parts separated by a blank line:
the message summary, body, and footer. The summary is required but the other two sections
are optional. When a change is very simple, a message summary is usually enough.

```
Message Summary
<blank line>
Message Body
<blank line>
Message Footer
```

### Message Summary
* Give a summary of your change in around 50 characters or less
* Use the imperative mood in the subject line

```
# Bad
❯ I added a README.md to the project
# Good
❯ Add README.md to the project
```

* No dot at the end
* Capitalize first letter

### Message Body
* Wrap the body at around 72 characters

   You have to do it manually because Git doesn't do it for you.
   If you don't then your paragraphs will flow off the edge of the
   screen when something like `git log`.

* Leave out the details about how a change was made

   When a commit is explained, focus on the *why* and *what*. Details
   about *how* a change was made can be explored simply by taking a
   look at the code. If the code being committed necessitates extra
   explanation, then this is best handled with source comments.

* Bullet points are okay to use

### Message Footer
* Close issues using [keywords](https://help.github.com/articles/closing-issues-using-keywords/)

* Add references to other issues if applicable

   Example: `See also: #112, #113`

* Mention breaking changes if applicable

## Sample of a Good Commit Message

```
Strip trailing and leading spaces from scope names

Recorded scopes previously contained trailing and leading
spaces. This caused scope validation to fail.

Closes #112
```

## Recommended Readings
* [Sequences of Commits](http://hassanali.me/2017/11/20/sequences-of-commits)
* [How to Write a Git Commit Message](https://chris.beams.io/posts/git-commit/)
