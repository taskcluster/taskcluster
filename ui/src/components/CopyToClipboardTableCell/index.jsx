import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import CheckIcon from 'mdi-react/CheckIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import { node, string } from 'prop-types';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import useCopyToClipboard from '../../utils/useCopyToClipboard';
import TableCellItem from '../TableCellItem';

const styles = (theme) => ({
  icon: {
    marginLeft: theme.spacing(1),
    display: 'flex',
  },
});

function CopyToClipboardTableCell(props) {
  const { isCopy, onCopyClick } = useCopyToClipboard();
  const { classes, tooltipTitle, textToCopy, text } = props;
  const iconSize = 16;

  return (
    <CopyToClipboard onCopy={onCopyClick} title={`${tooltipTitle} (${isCopy ? 'Copied!' : 'Copy'})`} text={textToCopy}>
      <TableCell>
        <TableCellItem button>
          {text}
          <div className={classes.icon}>
            {isCopy ? <CheckIcon size={iconSize} /> : <ContentCopyIcon size={iconSize} />}
          </div>
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

export default withStyles(styles)(CopyToClipboardTableCell);
