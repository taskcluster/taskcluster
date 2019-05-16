import { hot } from 'react-hot-loader';
import React, { Component } from 'react';
import { bool } from 'prop-types';
import TextField from '@material-ui/core/TextField/TextField';
import Dashboard from '../../../components/Dashboard';
import isWorkerTypeNameValid from '../../../utils/isWorkerTypeNameValid';

@hot(module)
export default class WMWorkerTypeEditor extends Component {
  static defaultProps = {
    isNewWorkerType: true,
  };

  static propTypes = {
    isNewWorkerType: bool,
  };

  state = {
    workerType: {},
  };

  handleInputChange = ({ target: { name, value } }) => {
    this.setState({ workerType: { ...this.state.workerType, [name]: value } });
  };

  render() {
    const { isNewWorkerType } = this.props;
    const { workerType } = this.state;

    return (
      <Dashboard
        title={
          isNewWorkerType
            ? 'Worker Manager: Create Worker Type'
            : 'Worker Manager: Edit Worker Type'
        }>
        <TextField
          label="Enter Worker Type Name..."
          name="workerType"
          error={
            Boolean(workerType.name) && !isWorkerTypeNameValid(workerType.name)
          }
          onChange={this.handleInputChange}
          fullWidth
          value=""
        />
      </Dashboard>
    );
  }
}
