import React from 'react';
import { node, string } from 'prop-types';
import withStyles from '../../utils/withStyles';
import TableCell from '@mui/material/TableCell';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import TableCellItem from '../TableCellItem';
import useCopyToClipboard from '../../utils/useCopyToClipboard';

const styles = theme => ({
  icon: {
    marginLeft: theme.spacing(1),
    display: 'flex',
  },
});

function CopyToClipboardTableCell(props) {
  const { isCopy, copy } = useCopyToClipboard();
  const { classes, textToCopy, tooltipTitle = textToCopy, text } = props;
  const iconSize = 16;
  const copyable = Boolean(textToCopy);
  const copyLabel = isCopy ? 'Copied!' : 'Copy';

  return (
    <TableCell
      {...(copyable && {
        title: tooltipTitle ? `${tooltipTitle} (${copyLabel})` : copyLabel,
        onClick: () => copy(textToCopy),
      })}>
      <TableCellItem button={copyable}>
        {text}
        {copyable && (
          <div className={classes.icon}>
            {isCopy ? (
              <CheckIcon size={iconSize} />
            ) : (
              <ContentCopyIcon size={iconSize} />
            )}
          </div>
        )}
      </TableCellItem>
    </TableCell>
  );
}

CopyToClipboardTableCell.propTypes = {
  // A tooltip to show when the user hovers on the list item
  tooltipTitle: string,
  // Text to copy when a user clicks on the list item
  textToCopy: string,
  // The TableCellText secondary prop
  text: node,
};

export default withStyles(styles)(CopyToClipboardTableCell);
