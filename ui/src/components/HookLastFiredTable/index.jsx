import React from 'react';
import { func, array } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { titleCase } from 'change-case';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import DateDistance from '../DateDistance';
import TableCellItem from '../TableCellItem';
import StatusLabel from '../StatusLabel';
import DataTable from '../DataTable';
import Link from '../../utils/Link';

const styles = theme => ({
  informationIcon: {
    marginLeft: theme.spacing(1),
  },
});

function HookLastFiredTable({ classes, ...props }) {
  const { items, onErrorClick, ...rest } = props;
  const iconSize = 16;
  const headers = [
    { label: 'Task ID', id: 'taskId', type: 'string' },
    { label: 'Reason', id: 'reason', type: 'string' },
    {
      label: 'Fire Status',
      id: 'fireStatus',
      type: 'string',
    },
    {
      label: 'Attempted',
      id: 'attempted',
      type: 'string',
    },
  ];

  return (
    <DataTable
      items={items}
      headers={headers}
      renderRow={hookFire => (
        <TableRow key={hookFire.taskId}>
          <TableCell>
            {(hookFire.result === 'SUCCESS' && (
              <Link to={`/tasks/${hookFire.taskId}`}>
                <TableCellItem button>
                  {hookFire.taskId}
                  <LinkIcon size={iconSize} />
                </TableCellItem>
              </Link>
            )) || <div>{hookFire.taskId}</div>}
          </TableCell>
          <TableCell>{titleCase(hookFire.firedBy)}</TableCell>
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
          <CopyToClipboardTableCell
            tooltipTitle={hookFire.taskCreateTime}
            textToCopy={hookFire.taskCreateTime}
            text={<DateDistance from={hookFire.taskCreateTime} />}
          />
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

export default withStyles(styles)(HookLastFiredTable);
