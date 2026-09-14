import React, { Component } from 'react';
import { string } from 'prop-types';
import { Helmet as ReactHelmet } from 'react-helmet';
import { TASK_STATE } from '../../utils/constants';
import Logo from '../../images/logo.png';
import LogoCompleted from '../../images/logoCompleted.png';
import LogoFailed from '../../images/logoFailed.png';
import LogoRunning from '../../images/logoRunning.png';

export default class Helmet extends Component {
  static propTypes = {
    /**
     * The state of the task or task group, in either the queue's lower case
     * or the UI's upper case spelling.
     * Leave this value undefined outside the Task and Task Group view.
     */
    state: string,
    /** The document title */
    title: string,
  };

  static defaultProps = {
    state: null,
    title: null,
  };

  getFavicon() {
    switch (this.props.state?.toUpperCase()) {
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
