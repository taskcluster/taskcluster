import { Component, Fragment } from 'react';
import { BrowserRouter, Switch } from 'react-router-dom';
import { object } from 'prop-types';
import ErrorPanel from '@mozilla-frontend-infra/components/ErrorPanel';
import { withStyles } from '@material-ui/core/styles';
import RouteWithProps from '../components/RouteWithProps';
import routes from './routes';

@withStyles(theme => ({
  '@global': {
    [[
      'input:-webkit-autofill',
      'input:-webkit-autofill:hover',
      'input:-webkit-autofill:focus',
      'input:-webkit-autofill:active',
    ].join(',')]: {
      transition:
        'background-color 5000s ease-in-out 0s, color 5000s ease-in-out 0s',
      transitionDelay: 'background-color 5000s, color 5000s',
    },
    '.mdi-icon': {
      fill: theme.palette.text.primary,
    },
    '.CodeMirror': {
      fontSize: 13,
      height: '100% !important',
    },
    '[disabled] .mdi-icon': {
      fill: theme.palette.primary.light,
    },
    a: {
      color: theme.palette.text.primary,
    },
    'html, body': {
      color: theme.palette.text.secondary,
    },
    pre: {
      overflowX: 'auto',
    },
    'pre, :not(pre) > code': {
      ...theme.mixins.highlight,
    },
  },
}))
export default class Main extends Component {
  static propTypes = {
    error: object,
  };

  static defaultProps = {
    error: null,
  };

  render() {
    const { error } = this.props;

    return (
      <Fragment>
        {error && <ErrorPanel error={error} />}
        <BrowserRouter>
          <Switch>
            {routes.map(props => (
              <RouteWithProps key={props.path || 'not-found'} {...props} />
            ))}
          </Switch>
        </BrowserRouter>
      </Fragment>
    );
  }
}
