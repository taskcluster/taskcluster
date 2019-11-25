import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { withApollo } from 'react-apollo';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import IconButton from '@material-ui/core/IconButton';
import Drawer from '@material-ui/core/Drawer';
import Toolbar from '@material-ui/core/Toolbar';
import TableRow from '@material-ui/core/TableRow';
import TableCell from '@material-ui/core/TableCell';
import { parse, stringify } from 'qs';
import PlayIcon from 'mdi-react/PlayIcon';
import DownloadIcon from 'mdi-react/DownloadIcon';
import CloseIcon from 'mdi-react/CloseIcon';
import StopIcon from 'mdi-react/StopIcon';
import InformationVariantIcon from 'mdi-react/InformationVariantIcon';
import Code from '@mozilla-frontend-infra/components/Code';
import urls from '../../utils/urls';
import ErrorPanel from '../../components/ErrorPanel';
import Dashboard from '../../components/Dashboard';
import HelpView from '../../components/HelpView';
import Button from '../../components/Button';
import SpeedDial from '../../components/SpeedDial';
import SpeedDialAction from '../../components/SpeedDialAction';
import DataTable from '../../components/DataTable';
import PulseBindings from '../../components/PulseBindings';
import pulseMessagesQuery from './pulseMessages.graphql';
import removeKeys from '../../utils/removeKeys';

const getBindingsFromProps = props => {
  const query = parse(props.location.search.slice(1));

  return query.bindings ? Object.values(query.bindings) : [];
};

@hot(module)
@withApollo
@withStyles(theme => ({
  iconButton: {
    '& svg': {
      fill: theme.palette.text.primary,
    },
  },
  playIcon: {
    ...theme.mixins.successIcon,
  },
  stopIcon: {
    ...theme.mixins.errorIcon,
  },
  infoButton: {
    marginLeft: -theme.spacing(2),
    marginRight: theme.spacing(1),
  },
  drawerContainer: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(2),
  },
  drawerHeadline: {
    paddingLeft: theme.spacing(3),
    paddingRight: theme.spacing(3),
  },
  drawerPaper: {
    width: '40vw',
    [theme.breakpoints.down('sm')]: {
      width: '90vw',
    },
  },
  drawerCloseIcon: {
    position: 'absolute',
    top: theme.spacing(1),
    right: theme.spacing(1),
  },
  ccContainer: {
    overflow: 'auto',
  },
  ccRoute: {
    whiteSpace: 'nowrap',
  },
  startStopIconSpan: {
    ...theme.mixins.fab,
    right: theme.spacing(11),
  },
}))
export default class PulseMessages extends Component {
  static getDerivedStateFromProps(props) {
    return {
      bindings: getBindingsFromProps(props),
    };
  }

  subscriptionObserver = null;

  constructor(props) {
    super(props);

    const bindings = getBindingsFromProps(props);

    this.state = {
      bindings,
      pulseExchange: '',
      pattern: '#',
      listening: false,
      messages: [],
      error: null,
      drawerOpen: false,
      drawerMessage: null,
      downloadLink: 'data:application/json;base64,IkJyb3dzZXIgSXNzdWUi',
    };
  }

  componentWillUnmount() {
    this.unsubscribe();
  }

  handleRoutingKeyPatternChange = ({ target: { value } }) => {
    this.setState({ pattern: value });
  };

  handlePulseExchangeChange = ({ target: { name, value } }) => {
    this.setState({ [name]: value });
  };

  handleAddBinding = () => {
    const { pulseExchange, pattern } = this.state;
    const bindings = this.state.bindings.concat([
      {
        exchange: pulseExchange,
        pattern,
      },
    ]);

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleDeleteBinding = ({ exchange, pattern }) => {
    this.handleStopListening();
    const bindings = this.state.bindings.filter(
      binding => binding.exchange !== exchange || binding.pattern !== pattern
    );

    this.props.history.replace(`/pulse-messages?${stringify({ bindings })}`);
  };

  handleStartListening = () => {
    this.setState({ listening: true, error: null });

    this.subscriptionObserver = this.props.client
      .subscribe({
        query: pulseMessagesQuery,
        variables: {
          subscriptions: this.state.bindings,
        },
      })
      .subscribe({
        next: ({ data: { pulseMessages } }) => {
          // ... call updateQuery to integrate the new comment
          // into the existing list of comments
          this.addMessage(pulseMessages);
        },
        error: error => {
          this.setState({ error, listening: false });
        },
      });
  };

  handleStopListening = () => {
    this.setState({ listening: false });

    this.unsubscribe();
  };

  handleMessageDrawerOpen = message => {
    this.setState({ drawerOpen: true, drawerMessage: message });
  };

  handleMessageDrawerClose = () => {
    this.setState({ drawerOpen: false, drawerMessage: null });
  };

  handleDownloadMessagesClick = () => {
    const a = Object.assign(document.createElement('a'), {
      href: this.state.downloadLink,
      download: 'pulse-messages.json',
    });

    // a.click() doesn't work on all browsers
    a.dispatchEvent(new MouseEvent('click'));
  };

  addMessage(message) {
    const messages = removeKeys(this.state.messages.concat(message), [
      '__typename',
    ]);
    const params = btoa(JSON.stringify(messages, null, 2));

    this.setState({
      messages,
      downloadLink: `data:application/json;base64,${params}`,
    });
  }

  unsubscribe() {
    if (this.subscriptionObserver) {
      this.subscriptionObserver.unsubscribe();
    }
  }

  render() {
    const { classes } = this.props;
    const {
      pulseExchange,
      pattern,
      bindings,
      listening,
      messages,
      error,
      drawerOpen,
      drawerMessage,
    } = this.state;
    const iconSize = 16;
    const description = `Bind to Pulse exchanges in your browser, observe messages arriving and inspect
      messages. Useful when debugging and working with undocumented Pulse exchanges.`;
    const headers = [
      { label: 'Exchange', id: 'exchange', type: 'string' },
      {
        label: 'Routing Key',
        id: 'routingKey',
        type: 'string',
      },
    ];

    return (
      <Dashboard
        title="Pulse Messages"
        helpView={
          <HelpView description={description}>
            <Typography variant="body2" paragraph>
              This tool lets you listen to Pulse messages from any exchange and
              routing key. When messages are received you can inspect the
              messages. This is useful for debugging and development when
              consuming from undocumented exchanges. Notice that all exchanges
              from {window.env.APPLICATION_NAME} are formally documented on{' '}
              <a
                href={urls.docs('/')}
                target="_blank"
                rel="noopener noreferrer">
                {urls.docs('/')}
              </a>
              .
            </Typography>
          </HelpView>
        }>
        <Fragment>
          <ErrorPanel error={error} />
          <PulseBindings
            bindings={bindings}
            onBindingAdd={this.handleAddBinding}
            onBindingRemove={this.handleDeleteBinding}
            onRoutingKeyPatternChange={this.handleRoutingKeyPatternChange}
            onPulseExchangeChange={this.handlePulseExchangeChange}
            pulseExchange={pulseExchange}
            pattern={pattern}
          />
          <List>
            <Toolbar>
              <Typography variant="body2" id="tableTitle">
                Messages
              </Typography>
            </Toolbar>
            <DataTable
              items={messages}
              noItemsMessage="No messages received."
              renderRow={message => (
                <TableRow
                  key={`message-${message.routingKey}-${message.exchange}`}>
                  <TableCell>
                    <IconButton
                      className={classes.infoButton}
                      onClick={() => this.handleMessageDrawerOpen(message)}>
                      <InformationVariantIcon size={iconSize} />
                    </IconButton>
                    {message.exchange}
                  </TableCell>
                  <TableCell>{message.routingKey}</TableCell>
                </TableRow>
              )}
              headers={headers}
            />
          </List>
          {listening ? (
            <Button
              variant="round"
              spanProps={{ className: classes.startStopIconSpan }}
              tooltipProps={{ title: 'Stop Listening' }}
              onClick={this.handleStopListening}
              className={classes.stopIcon}>
              <StopIcon />
            </Button>
          ) : (
            <Button
              variant="round"
              spanProps={{ className: classes.startStopIconSpan }}
              tooltipProps={{ title: 'Start Listening' }}
              onClick={this.handleStartListening}
              className={classes.playIcon}
              disabled={!bindings.length}>
              <PlayIcon />
            </Button>
          )}
          <SpeedDial>
            <SpeedDialAction
              tooltipOpen
              icon={<DownloadIcon />}
              tooltipTitle="Download Messages"
              onClick={this.handleDownloadMessagesClick}
              FabProps={{ disabled: !messages[0] }}
            />
          </SpeedDial>
          <Drawer
            anchor="right"
            open={drawerOpen}
            classes={{
              paper: classes.drawerPaper,
            }}
            onClose={this.handleMessageDrawerClose}>
            <Fragment>
              <IconButton
                onClick={this.handleMessageDrawerClose}
                className={classes.drawerCloseIcon}>
                <CloseIcon />
              </IconButton>
              <div className={classes.drawerContainer}>
                <Typography variant="h5" className={classes.drawerHeadline}>
                  Message
                </Typography>
                <List>
                  <ListItem>
                    <ListItemText
                      primary="Exchange"
                      secondary={
                        <code>{drawerMessage && drawerMessage.exchange}</code>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Routing Key"
                      secondary={
                        <code>{drawerMessage && drawerMessage.routingKey}</code>
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Redelivered"
                      secondary={
                        drawerMessage && drawerMessage.redelivered
                          ? 'True'
                          : 'False'
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="CC Routes"
                      secondary={
                        drawerMessage && drawerMessage.cc.length ? (
                          <List className={classes.ccContainer}>
                            {drawerMessage.cc.map(route => (
                              <ListItem key={route} className={classes.ccRoute}>
                                <code>{route}</code>
                              </ListItem>
                            ))}
                          </List>
                        ) : (
                          'n/a'
                        )
                      }
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemText
                      primary="Payload"
                      secondaryTypographyProps={{
                        component: 'div',
                      }}
                      secondary={
                        drawerMessage && (
                          <Code language="json">
                            {JSON.stringify(drawerMessage.payload, null, 2)}
                          </Code>
                        )
                      }
                    />
                  </ListItem>
                </List>
              </div>
            </Fragment>
          </Drawer>
        </Fragment>
      </Dashboard>
    );
  }
}
