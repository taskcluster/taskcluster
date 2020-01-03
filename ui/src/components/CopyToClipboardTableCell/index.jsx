import React from 'react';
import { node, string } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import TableCell from '@material-ui/core/TableCell';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import TableCellItem from '../TableCellItem';
import useCopyToClipboard from '../../utils/useCopyToClipboard';

function CopyToClipboardTableCell(props) {
  const { isCopy, onCopyClick } = useCopyToClipboard();
  const { tooltipTitle, textToCopy, text } = props;
  const iconSize = 16;

  return (
    <CopyToClipboard
      onCopy={onCopyClick}
      title={`${tooltipTitle} (${isCopy ? 'Copied!' : 'Copy'})`}
      text={textToCopy}>
      <TableCell>
        <TableCellItem button>
          {text}
          {isCopy ? (
            <CheckIcon size={iconSize} />
          ) : (
            <ContentCopyIcon size={iconSize} />
          )}
        </TableCellItem>
      </TableCell>
    </CopyToClipboard>
  );
}

CopyToClipboardTableCell.propTypes = {
  // A tooltip to show when the user hovers on the list item
  tooltipTitle: string.isRequired,
  // Text to copy when a user clicks on the list item
  textToCopy: string.isRequired,
  // The TableCellText secondary prop
  text: node,
};

CopyToClipboardTableCell.defaultProps = {
  text: null,
};

export default CopyToClipboardTableCell;
