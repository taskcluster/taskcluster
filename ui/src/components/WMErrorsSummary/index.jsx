import React, { Component, Fragment } from 'react';
import { func, object, string } from 'prop-types';
import { Grid } from '@material-ui/core';
import summarizeWorkerPoolsStats from '../StatusDashboard/summarizeWorkerPoolsStats';
import StatusGroup from '../StatusDashboard/StatusGroup';
import Button from '../Button';

const MiniTable = ({ data, title, onStatClick, selectedKey }) => (
  <div>
    <table aria-label={title} style={{ width: '100%' }}>
      <thead>
        <tr>
          <th align="left">{title}</th>
          <th align="left">Count</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(data).map(([key, value]) => (
          <tr
            key={key}
            style={{ backgroundColor: selectedKey === key ? '#55555533' : '' }}
            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
            <td>
              {onStatClick ? (
                <Button onClick={() => onStatClick(key)}>{key}</Button>
              ) : (
                key
              )}
            </td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default class WorkerManagerErrorsSummary extends Component {
  static propTypes = {
    data: object.isRequired,
    onStatClick: func,
    selectedLaunchConfigId: string,
  };

  render() {
    const {
      data: { loading, WorkerManagerErrorsStats },
    } = this.props;
    const errorWidgets =
      !loading && WorkerManagerErrorsStats
        ? {
            Summary: summarizeWorkerPoolsStats(this.props),
          }
        : {};

    return (
      <Fragment>
        {!loading && errorWidgets && (
          <Fragment>
            <StatusGroup widgets={errorWidgets} tiny />
            <Grid container spacing={2} style={{ marginBottom: 20 }}>
              <Grid item xs={12} md={4}>
                <MiniTable
                  data={WorkerManagerErrorsStats?.totals?.title}
                  title="Errors by title"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MiniTable
                  data={WorkerManagerErrorsStats?.totals?.code}
                  title="Errors by error code"
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <MiniTable
                  data={WorkerManagerErrorsStats?.totals?.launchConfigId}
                  title="Errors by launch config"
                  selectedKey={this.props.selectedLaunchConfigId}
                  onStatClick={this.props.onStatClick}
                />
              </Grid>
            </Grid>
          </Fragment>
        )}
      </Fragment>
    );
  }
}
