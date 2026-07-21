import React from 'react';
import { bool, object, string } from 'prop-types';
import { useHistory } from 'react-router-dom';
import HistoryIcon from 'mdi-react/HistoryIcon';
import SpeedDialAction from '../SpeedDialAction';

function AuditHistorySpeedDialAction({
  disabled,
  entityId,
  entityName,
  FabProps,
  ...props
}) {
  const history = useHistory();

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

AuditHistorySpeedDialAction.propTypes = {
  disabled: bool,
  entityId: string.isRequired,
  entityName: string.isRequired,
  FabProps: object,
};

AuditHistorySpeedDialAction.defaultProps = {
  disabled: false,
  FabProps: {},
};

export default AuditHistorySpeedDialAction;
