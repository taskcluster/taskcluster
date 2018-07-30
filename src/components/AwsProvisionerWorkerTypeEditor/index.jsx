import { Component } from 'react';
import { oneOfType, string, func } from 'prop-types';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import { awsProvisionerWorkerType } from '../../utils/prop-types';

const defaultWorkerType = {
  minCapacity: 0,
  maxCapacity: 5,
  scalingRatio: 0,
  minPrice: 0,
  maxPrice: 0.6,
  canUseOndemand: false,
  canUseSpot: true,
  instanceTypes: [
    {
      instanceType: 'c3.xlarge',
      capacity: 1,
      utility: 1,
      secrets: {},
      scopes: [],
      userData: {},
      launchSpec: {},
    },
  ],
  regions: [
    {
      region: 'us-west-2',
      secrets: {},
      scopes: [],
      userData: {},
      launchSpec: {
        ImageId: 'ami-xx',
      },
    },
  ],
  userData: {},
  launchSpec: {},
  secrets: {},
  scopes: [],
};

export default class AwsProvisionerCreateWorkerTypeEditor extends Component {
  static propTypes = {
    value: oneOfType([string, awsProvisionerWorkerType]),
    onEditorChange: func.isRequired,
  };

  static defaultProps = {
    value: defaultWorkerType,
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
