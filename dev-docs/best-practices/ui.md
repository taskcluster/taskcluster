# UI

The Taskcluster UI is implemented in the `ui/` directory of this repository.
When we have a good reason to not follow the best practices in the UI, we document why.

## Contents
* [Tables](#tables)
* [Dialogs](#dialogs)
* [Action Buttons](#action-buttons)
* [Links](#links)
* [Buttons](#buttons)
* [Text](#text)
* [Spacing](#spacing)
* [Color](#color)
* [Visual Hierarchy](#visual-hierarchy)
* [Document Header Hierarchy](#document-header-hierarchy)
* [Styling](#styling)
* [Tracking Changes](#tracking-changes)

## Tables
* Avoid multi-line text in a table - too much information for the given space. Alternatives:
  * A [Card](https://material-ui.com/components/cards/).
  * A [Drawer](https://material-ui.com/components/drawers/) that opens up via a button click in the table.
* Right-align numbers - it’s easier to scan a column of numbers if the decimal part starts in the same location.

## Dialogs
* Focus should go to the first action button when the modal is opened.
This should be the close modal button. This will help prevent users
from accidentally triggering a destructive action.

## Action Buttons

A button that mutates state on the backend will most likely require a
set of scopes to execute. In order to avoid sending useless requests for calls expecting scopes, action buttons should
be disabled when the user is not logged in. The only exception to this rule is the "save" button when editing a form
since the disable -> enable state transition is used as a feedback mechanism to help users not forget to save their
changes.

## Links
* Calculate link URLs before the user clicks on them. By doing so, a user will be able to do things like open links in a
new tab or have the ability to inspect link URLs prior to the clicking.

_Don't_

```jsx
handleLinkClick = () => {
   this.props.history.push(...);
};

<Link onClick={handleLinkClick} />
```

_Do_

```
<Link to={...} />
```

## Buttons
* Destructive actions (e.g., a delete operation) should have a confirmation step.
It’s an added click but will prevent accidental data loss frustration.

## Text
* Don’t center text spanning more than 3 lines. It’s not pretty. Alternatives:
  * Rewrite the content to be shorter.
  * Left-align the content if the text direction is left-to-right. Otherwise Right-align.

## Spacing
If you need to add spacing to an element, use the spacing scale defined in the UI as opposed to picking
a number that looks right to you. This will make sure there is a feel of consistency across the site design.
The spacing scale for Taskcluster UI is defined
[here](https://github.com/taskcluster/taskcluster/blob/8b32ca158622af8450626579ad1d4b9d8f1d3a85/ui/src/theme.js#L129-L134)

## Color
Don’t depend only on color to communicate information, otherwise people who are color blind will have a hard time
understanding the UI. You can use labels. For things like graphs, you can use different shades of the same color.
They are easier to differentiate for someone who is color blind since the colors will differ in contrast.

## Visual Hierarchy
Each button in a view has its own level of importance in that page relative to other actions.
Most views have a single primary action, a couple that are medium emphasis and some that are rarely used.
Buttons that are not primary should not have high contrast background colors.
For example, a destructive button that isn’t considered a primary action in a view destructive does not
need to be red and bold. It could have a secondary look. Still want it to be red and bold?
Hide it behind a menu like a [SpeedDial](https://material-ui.com/components/speed-dial/) component.

## Document Header Hierarchy
Document hierarchy should be respected everywhere, especially for documentation pages.
There should be at most one `h1` tag in a page and it should be the first header in the document.

## Styling
* Avoid inline styling - use class names instead to separate content from design.

## Tracking Changes
Any pull request to the UI should contain a new snippet in the
`changelog/` directory. Styling changes and minor adjustments to a
component (e.g., changing a `div` into a `span`) however can be ignored. Refer to
[changelog.md](https://github.com/taskcluster/taskcluster/blob/master/dev-docs/best-practices/changelog.md)
for the format of the changelog file.

---

Did you find a place in the UI where some of the guidelines are not followed?
[File an issue](https://github.com/taskcluster/taskcluster/issues/new/).
Bonus points for sending a pull-request to close the issue :-)
