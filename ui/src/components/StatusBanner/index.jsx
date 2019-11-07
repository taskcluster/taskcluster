import React, { Component } from 'react';
import { string } from 'prop-types';
import storage from 'localforage';
import { addDays, isBefore } from 'date-fns';
import Snackbar from '../Snackbar';

const BANNER_KEY = 'hide-taskcluster-ui-banner';

export default class StatusBanner extends Component {
  static propTypes = {
    message: string,
  };

  static defaultProps = {
    message: null,
  };

  state = {
    open: false,
  };

  async componentDidMount() {
    const bannerMemory = await storage.getItem(BANNER_KEY);

    this.setState({
      open: bannerMemory ? isBefore(bannerMemory, new Date()) : true,
    });
  }

  handleSnackbarClose = (event, reason) => {
    // A banner message is pretty important for users to see so we should
    // require user interaction to hide it.
    // This would also avoid accidentally hiding the message
    if (reason === 'clickaway') {
      return;
    }

    this.setState({ open: false });
    storage.setItem(BANNER_KEY, addDays(new Date(), 1));
  };

  render() {
    const { open } = this.state;
    const { message } = this.props;

    if (!message) {
      return null;
    }

    return (
      <Snackbar
        autoHideDuration={null}
        onClose={this.handleSnackbarClose}
        message={message}
        variant="info"
        open={open}
      />
    );
  }
}
