level: major
reference: issue 895
---
Material-ui updated from v3 to v4.

Main updates for developers of taskcluster:
theme.spacing.unit usage is deprecated, you can use the new API:
theme.spacing(1)
Tip: you can provide more than 1 argument: theme.spacing(1, 2) // = '8px 16px'.

[Grid] In order to support arbitrary spacing values and to remove the need to mentally count by 8, material-ui changed the spacing API:
    -  spacing: PropTypes.oneOf([0, 8, 16, 24, 32, 40]),
    +  spacing: PropTypes.oneOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),



[Divider] Remove the deprecated inset prop.
    -<Divider inset />
    +<Divider variant="inset" />

[List] dense no longer reduces the top and bottom padding of the List element.

[TableCell] Move the dense mode to a different property:

    -<TableCell padding="dense" />
    +<TableCell size="small" />


[Paper] Reduce the default elevation. Change the default Paper elevation to match the Card and the Expansion Panel:

    -<Paper />
    +<Paper elevation={2} />

This affects the ExpansionPanel as well.

[Breadcrumbs] moved from lab to core