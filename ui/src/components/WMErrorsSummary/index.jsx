import React, { Component, Fragment } from 'react';
import { object } from 'prop-types';
import { Grid } from '@material-ui/core';
import summarizeWorkerPoolsStats from '../StatusDashboard/summarizeWorkerPoolsStats';
import StatusGroup from '../StatusDashboard/StatusGroup';

const MiniTable = ({ data, title }) => (
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
            sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
            <td>{key}</td>
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
              <Grid item xs={12} md={6}>
                <MiniTable
                  data={WorkerManagerErrorsStats?.totals?.title}
                  title="Errors by title"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <MiniTable
                  data={WorkerManagerErrorsStats?.totals?.code}
                  title="Errors by error code"
                />
              </Grid>
            </Grid>
          </Fragment>
        )}
      </Fragment>
    );
  }
}
