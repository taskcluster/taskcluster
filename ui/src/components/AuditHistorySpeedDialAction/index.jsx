import React, { Component } from 'react';
import { bool, object, string } from 'prop-types';
import { withRouter } from 'react-router-dom';
import HistoryIcon from 'mdi-react/HistoryIcon';
import SpeedDialAction from '../SpeedDialAction';

@withRouter
/**
 * A speed dial action that links to an entity's audit history.
 */
export default class AuditHistorySpeedDialAction extends Component {
  static propTypes = {
    /** If true, the audit history action is disabled. */
    disabled: bool,
    /** The ID of the entity whose audit history should be displayed. */
    entityId: string.isRequired,
    /** The type of entity whose audit history should be displayed. */
    entityName: string.isRequired,
    /** Props applied to the underlying floating action button. */
    FabProps: object,
  };

  static defaultProps = {
    disabled: false,
    FabProps: {},
  };

  render() {
    const {
      disabled,
      entityId,
      entityName,
      FabProps,
      history,
      location: _location,
      match: _match,
      staticContext: _staticContext,
      ...props
    } = this.props;

    return (
      <SpeedDialAction
        {...props}
        requiresAuth
        tooltipOpen
        icon={<HistoryIcon />}
        onClick={() => {
          history.push(`/audit/${entityName}/${encodeURIComponent(entityId)}`);
        }}
        tooltipTitle="View Audit History"
        FabProps={{ ...FabProps, disabled }}
      />
    );
  }
}
