import React, { Component } from 'react';
import { string, bool } from 'prop-types';
import { Chip } from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';
import WorkerIcon from 'mdi-react/WorkerIcon';
import ProgressClockIcon from 'mdi-react/ProgressClockIcon';
import HourglassIcon from 'mdi-react/HourglassIcon';
import HexagonSlice4 from 'mdi-react/HexagonSlice4Icon';
import MessageAlertIcon from 'mdi-react/MessageAlertIcon';
import Link from '../../utils/Link';
import { splitWorkerPoolId } from '../../utils/workerPool';

@withStyles(theme => ({
  navbar: {
    display: 'flex',
    flexWrap: 'wrap',
    flex: 1,

    [theme.breakpoints.down('sm')]: {
      marginTop: theme.spacing(1),
    },

    '& .MuiChip-root': {
      paddingLeft: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5),

      [theme.breakpoints.up('lg')]: {
        paddingLeft: theme.spacing(1),
        paddingRight: theme.spacing(1),
      },
    },

    '& .MuiChip-label': {
      paddingRight: 6,
      paddingLeft: 6,

      color: theme.palette.text.secondary,

      '&:hover': {
        color: theme.palette.text.primary,
      },

      [theme.breakpoints.up('lg')]: {
        paddingRight: 12,
        paddingLeft: 12,
      },
    },
  },
  active: {
    backgroundColor: theme.palette.secondary.main,
    '& .MuiChip-label': {
      color: theme.palette.common.white,
    },
  },
}))
export default class WorkersNavbar extends Component {
  static propTypes = {
    provisionerId: string,
    workerType: string,
    workerPoolId: string,
    hasWorkerPool: bool,
  };

  static defaultProps = {
    provisionerId: null,
    workerType: null,
    workerPoolId: null,
    hasWorkerPool: false,
  };

  get workerPoolId() {
    if (this.props.workerPoolId) {
      return this.props.workerPoolId;
    }

    if (this.props.provisionerId && this.props.workerType) {
      return `${this.props.provisionerId}/${this.props.workerType}`;
    }

    throw new Error(
      'workerPoolId, provisionerId and workerType are all missing'
    );
  }

  get workerType() {
    if (this.props.workerType) {
      return this.props.workerType;
    }

    if (this.props.workerPoolId) {
      return splitWorkerPoolId(this.props.workerPoolId).workerType;
    }

    throw new Error('workerType and workerPoolId are both missing');
  }

  get provisionerId() {
    if (this.props.provisionerId) {
      return this.props.provisionerId;
    }

    if (this.props.workerPoolId) {
      return splitWorkerPoolId(this.props.workerPoolId).provisionerId;
    }

    throw new Error('provisionerId and workerPoolId are both missing');
  }

  render() {
    const { classes } = this.props;
    const { workerPoolId, provisionerId, workerType } = this;
    const workerTypeUrl = `/provisioners/${provisionerId}/worker-types/${workerType}`;
    const workerPoolUrl = `/worker-manager/${encodeURIComponent(workerPoolId)}`;
    let items = [
      {
        icon: WorkerIcon,
        label: 'Queue Workers',
        to: workerTypeUrl,
        hint: 'Show workers as seen by queue',
      },
      {
        icon: WorkerIcon,
        label: 'W-M Workers',
        to: `${workerPoolUrl}/workers`,
        hint: 'Show workers as seen by worker manager',
        onlyWorkerManager: true,
      },
      {
        icon: HourglassIcon,
        label: 'Pending Tasks',
        to: `/provisioners/${provisionerId}/worker-types/${workerType}/pending-tasks`,
        hint: 'Show pending tasks',
      },
      {
        icon: ProgressClockIcon,
        label: 'Claimed Tasks',
        to: `/provisioners/${provisionerId}/worker-types/${workerType}/claimed-tasks`,
        hint: 'Show claimed tasks',
      },
      {
        icon: HexagonSlice4,
        label: 'Worker Pool',
        to: `/worker-manager/${encodeURIComponent(workerPoolId)}`,
        hint: 'Show worker pool definition',
        onlyWorkerManager: true,
      },
      {
        icon: HexagonSlice4,
        label: 'Launch Configs',
        to: `/worker-manager/${encodeURIComponent(
          workerPoolId
        )}/launch-configs`,
        hint: 'Show worker pool definition',
        onlyWorkerManager: true,
      },
      {
        icon: MessageAlertIcon,
        label: 'Errors',
        to: `/worker-manager/${encodeURIComponent(workerPoolId)}/errors`,
        hint: 'Worker-manager errors',
        onlyWorkerManager: true,
      },
    ];

    if (!this.props.hasWorkerPool) {
      items = items.filter(item => !item.onlyWorkerManager);
    }

    return (
      <div className={classes.navbar}>
        {items.map(item => (
          <Chip
            key={item.to}
            size="medium"
            icon={<item.icon />}
            label={item.label}
            title={item.hint}
            component={Link}
            color="primary"
            nav
            activeClassName={classes.active}
            isActive={() => window.location.pathname === item.to}
            clickable
            to={item.to}
          />
        ))}
      </div>
    );
  }
}
