import React from 'react';
import { func, bool, array } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import LinkIcon from 'mdi-react/LinkIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
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
      headers={['Task ID', 'Fired By', 'Result', 'Attempted']}
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
            <Typography>{hookFire.firedBy}</Typography>
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
          <TableCell>
            <DateDistance from={hookFire.taskCreateTime} />
          </TableCell>
        </TableRow>
      )}
      {...rest}
    />
  );
}

HookLastFiredTable.propTypes = {
  /** An array of hooks last fired results. */
  items: array.isRequired,
  paginate: bool,
  /** Callback function fired when the error information icon is clicked. */
  onErrorClick: func.isRequired,
};

HookLastFiredTable.defaultProps = {
  paginate: false,
};

export default useStyles(HookLastFiredTable);
