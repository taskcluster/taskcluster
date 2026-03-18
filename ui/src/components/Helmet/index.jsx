import { string } from 'prop-types';
import { Component } from 'react';
import { Helmet as ReactHelmet } from 'react-helmet';
import Logo from '../../images/logo.png';
import LogoCompleted from '../../images/logoCompleted.png';
import LogoFailed from '../../images/logoFailed.png';
import LogoRunning from '../../images/logoRunning.png';
import { TASK_STATE } from '../../utils/constants';
import { taskState } from '../../utils/prop-types';

export default class Helmet extends Component {
  static propTypes = {
    /**
     * The state of the task or task group.
     * Leave this value undefined outside the Task and Task Group view.
     */
    state: taskState,
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
