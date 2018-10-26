import { BrowserRouter, Switch } from 'react-router-dom';
import React, { Component, Fragment } from 'react';
import { object } from 'prop-types';
import { withStyles } from '@material-ui/core/styles';
import RouteWithProps from '../components/RouteWithProps';
import routes from './routes';
import ErrorPanel from '../components/ErrorPanel';

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
    '.json-inspector__leaf': {
      '&.json-inspector__leaf_root': {
        paddingLeft: '0 !important',
      },
    },
    '.json-inspector__not-found': {
      color: '#F77669 !important',
    },
    ...(theme.palette.type === 'dark'
      ? {
          '.json-inspector__key': {
            color: '#80CBAE !important',
          },
          '.json-inspector__value_string': {
            color: '#C3E88D !important',
          },
          '.json-inspector__value_boolean': {
            color: '#F77669 !important',
          },
          '.json-inspector__value_number': {
            color: '#F77669 !important',
          },
          '.json-inspector__hl': {
            background: '#505050 !important',
            boxShadow: '0 -1px 0 2px #505050 !important',
          },
          '.json-inspector__search': {
            '&:hover': {
              borderBottom: '1px solid #fff',
            },
            '&:focus': {
              borderBottom: '1px solid #485460',
            },
            outline: 'none',
            display: 'block',
            width: 300,
            height: 32,
            padding: '0 !important',
            fontSize: theme.typography.fontSize - 1,
            color: '#fff',
            background: 'transparent',
            borderBottom: '1px solid #b8bdc0',
            borderLeft: 0,
            borderRight: 0,
            borderTop: 0,
            '-webkitBoxShadow': 'inset 0 1px 1px rgba(0, 0, 0, .075)',
            boxShadow: 'inset 0 1px 1px rgba(0, 0, 0, .075)',
            '-webkitTransition':
              'border-color ease-in-out .15s, -webkit-box-shadow ease-in-out .15s',
            '-oTransition':
              'border-color ease-in-out .15s, box-shadow ease-in-out .15s',
            transition:
              'border-color ease-in-out .15s, box-shadow ease-in-out .15s',
          },
        }
      : {
          '.json-inspector__search': {
            outline: 'none',
            display: 'block',
            width: 300,
            height: 32,
            padding: '0 !important',
            fontSize: theme.typography.fontSize - 1,
            background: 'transparent',
            borderBottom: `1px solid #949494`,
            '&:hover': {
              borderBottom: `1px solid ${theme.palette.text.primary}`,
            },
            '&:focus': {
              borderBottom: `1px solid ${theme.palette.text.primary}`,
            },
            borderLeft: 0,
            borderRight: 0,
            borderTop: 0,
            '-webkitTransition':
              'border-color ease-in-out .15s, -webkit-box-shadow ease-in-out .15s',
            '-oTransition':
              'border-color ease-in-out .15s, box-shadow ease-in-out .15s',
            transition:
              'border-color ease-in-out .15s, box-shadow ease-in-out .15s',
          },
        }),
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
        <ErrorPanel error={error} />
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
