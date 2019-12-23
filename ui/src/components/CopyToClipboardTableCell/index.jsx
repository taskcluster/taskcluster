import React, { useState, useEffect } from 'react';
import { node, string } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import TableCell from '@material-ui/core/TableCell';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import CheckIcon from 'mdi-react/CheckIcon';
import TableCellItem from '../TableCellItem';

function CopyToClipboardTableCell(props) {
  const [isCopy, setCopy] = useState(false);
  const { tooltipTitle, textToCopy, secondary } = props;

  function handleCopyClick() {
    setCopy(true);
  }

  useEffect(() => {
    if (isCopy) {
      setTimeout(() => {
        setCopy(false);
      }, 3000);
    }
  }, [isCopy]);

  const IconSize = 16;

  return (
    <CopyToClipboard
      onCopy={handleCopyClick}
      title={`${tooltipTitle} (${isCopy ? 'Copied!' : 'Copy'})`}
      text={textToCopy}>
      <TableCell>
        <TableCellItem button>
          secondary={secondary}
          {isCopy ? <CheckIcon /> : <ContentCopyIcon size={IconSize} />}
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
  secondary: node,
};

CopyToClipboardTableCell.defaultProps = {
  secondary: null,
};

export default CopyToClipboardTableCell;
