import React from 'react';
import { node, string } from 'prop-types';
import withStyles from '../../utils/withStyles';
import { CopyToClipboard } from 'react-copy-to-clipboard';
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
  const { isCopy, onCopyClick } = useCopyToClipboard();
  const { classes, textToCopy, tooltipTitle = textToCopy, text } = props;
  const iconSize = 16;
  const copyable = Boolean(textToCopy);
  const cell = (
    <TableCell>
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

  if (!copyable) {
    return cell;
  }

  const copyLabel = isCopy ? 'Copied!' : 'Copy';

  return (
    <CopyToClipboard
      onCopy={onCopyClick}
      title={tooltipTitle ? `${tooltipTitle} (${copyLabel})` : copyLabel}
      text={textToCopy}>
      {cell}
    </CopyToClipboard>
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
