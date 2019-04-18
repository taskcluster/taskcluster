import React from 'react';
import { func, array } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import { titleCase } from 'change-case';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import ContentCopyIcon from 'mdi-react/ContentCopyIcon';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import DateDistance from '../DateDistance';
import TableCellListItem from '../TableCellListItem';
import StatusLabel from '../StatusLabel';
import DataTable from '../DataTable';
import Link from '../../utils/Link';

const useStyles = withStyles(theme => ({
  informationIcon: {
    marginLeft: theme.spacing.unit,
  },
}));

function HookLastFiredTable({ classes, ...props }) {
  const { items, onErrorClick, ...rest } = props;
  const iconSize = 16;

  return (
    <DataTable
      items={items}
      headers={['Task ID', 'Reason', 'Result', 'Attempted']}
      renderRow={hookFire => (
        <TableRow key={hookFire.taskId}>
          <TableCell>
            {(hookFire.result === 'SUCCESS' && (
              <TableCellListItem
                button
                component={Link}
                to={`/tasks/${hookFire.taskId}`}>
                <ListItemText
                  disableTypography
                  primary={<Typography>{hookFire.taskId}</Typography>}
                />
                <LinkIcon size={iconSize} />
              </TableCellListItem>
            )) || <Typography>{hookFire.taskId}</Typography>}
          </TableCell>
          <TableCell>
            <Typography>{titleCase(hookFire.firedBy)}</Typography>
          </TableCell>
          <TableCell>
            <StatusLabel state={hookFire.result} />
            {hookFire.result === 'ERROR' && (
              <IconButton
                className={classes.informationIcon}
                name={hookFire.taskId}
                onClick={onErrorClick}>
                <InformationVariantIcon size={iconSize} />
              </IconButton>
            )}
          </TableCell>
          <CopyToClipboard
            title={`${hookFire.taskCreateTime} (Copy)`}
            text={hookFire.taskCreateTime}>
            <TableCell>
              <TableCellListItem button>
                <ListItemText
                  disableTypography
                  primary={
                    <Typography>
                      <DateDistance from={hookFire.taskCreateTime} />
                    </Typography>
                  }
                />
                <ContentCopyIcon size={iconSize} />
              </TableCellListItem>
            </TableCell>
          </CopyToClipboard>
        </TableRow>
      )}
      {...rest}
    />
  );
}

HookLastFiredTable.propTypes = {
  /** An array of hooks last fired results. */
  items: array.isRequired,
  /** Callback function fired when the error information icon is clicked. */
  onErrorClick: func.isRequired,
};

export default useStyles(HookLastFiredTable);
