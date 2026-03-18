import IconButton from '@material-ui/core/IconButton';
import { withStyles } from '@material-ui/core/styles';
import TableCell from '@material-ui/core/TableCell';
import TableRow from '@material-ui/core/TableRow';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { array, func } from 'prop-types';
import { titleCase } from 'title-case';
import Link from '../../utils/Link';
import CopyToClipboardTableCell from '../CopyToClipboardTableCell';
import DataTable from '../DataTable';
import DateDistance from '../DateDistance';
import StatusLabel from '../StatusLabel';
import TableCellItem from '../TableCellItem';

const styles = (theme) => ({
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
      label: 'Task State',
      id: 'taskState',
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
      renderRow={(hookFire) => (
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
              <IconButton className={classes.informationIcon} name={hookFire.taskId} onClick={onErrorClick}>
                <InformationVariantIcon size={iconSize} />
              </IconButton>
            )}
          </TableCell>
          <TableCell>
            <StatusLabel state={hookFire.taskState} />
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
