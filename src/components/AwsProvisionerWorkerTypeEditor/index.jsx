import React, { Component } from 'react';
import { oneOfType, string, func } from 'prop-types';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { awsProvisionerWorkerType } from '../../utils/prop-types';

export default class AwsProvisionerCreateWorkerTypeEditor extends Component {
  static propTypes = {
    value: oneOfType([string, awsProvisionerWorkerType]).isRequired,
    onEditorChange: func.isRequired,
  };

  handleEditorChange = value => {
    this.props.onEditorChange(value);
  };

  render() {
    const { value } = this.props;

    return (
      <CodeEditor
        options={{ mode: 'json' }}
        value={JSON.stringify(value, null, 2)}
        onChange={this.handleEditorChange}
      />
    );
  }
}
