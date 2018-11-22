import React, { Component } from 'react';
import { string } from 'prop-types';
import { Helmet as ReactHelmet } from 'react-helmet';
import { taskGroupState } from '../../utils/prop-types';
import { TASK_STATE } from '../../utils/constants';
import Logo from '../../images/logo.png';
import LogoCompleted from '../../images/logoCompleted.png';
import LogoFailed from '../../images/logoFailed.png';
import LogoRunning from '../../images/logoRunning.png';

export default class Helmet extends Component {
  static propTypes = {
    /**
     * The state of the task group.
     * Leave this value undefined outside the Task Group view.
     */
    state: taskGroupState,
    /** The document title */
    title: string,
  };

  static defaultProps = {
    state: null,
    title: null,
  };

  getFavicon() {
    switch (this.props.state) {
      case TASK_STATE.COMPLETED:
        return LogoCompleted;
      case TASK_STATE.FAILED:
        return LogoFailed;
      case TASK_STATE.RUNNING:
        return LogoRunning;
      default:
        return Logo;
    }
  }

  render() {
    const { title } = this.props;
    const Favicon = this.getFavicon();

    return (
      <ReactHelmet>
        <link href={Favicon} rel="shortcut icon" />
        {title && <title>{title}</title>}
      </ReactHelmet>
    );
  }
}
