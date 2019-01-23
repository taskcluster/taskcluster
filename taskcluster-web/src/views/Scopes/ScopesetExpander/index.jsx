import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Query } from 'react-apollo';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import HelpView from '../../../components/HelpView';
import Dashboard from '../../../components/Dashboard/index';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import splitLines from '../../../utils/splitLines';
import scopesetQuery from './scopeset.graphql';

@hot(module)
@withStyles(theme => ({
  actionButton: {
    ...theme.mixins.fab,
  },
  editor: {
    marginBottom: theme.spacing.double,
  },
  title: {
    marginBottom: theme.spacing.double,
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    paddingTop: theme.spacing.unit / 2,
    paddingBottom: theme.spacing.unit / 2,
  },
}))
export default class ScopesetExpander extends Component {
  state = {
    scopeText: '',
  };

  handleExpandScopesClick = async () => {
    const scopes = splitLines(this.state.scopeText);

    this.setState({ scopes });
  };

  handleScopesChange = scopeText => {
    this.setState({ scopeText });
  };

  render() {
    const { classes } = this.props;
    const { scopes, scopeText } = this.state;
    const description = `This tool allows you to find the expanded copy of a given scopeset, with 
    scopes implied by any roles included.`;

    return (
      <Dashboard
        title="Expand Scopesets"
        helpView={<HelpView description={description} />}>
        <Fragment>
          <CodeEditor
            className={classes.editor}
            onChange={this.handleScopesChange}
            placeholder="new-scope:for-something:*"
            mode="scopemode"
            value={scopeText}
          />
          {scopes && (
            <Query query={scopesetQuery} variables={{ scopes }}>
              {({ loading, error, data: { expandScopes } }) => (
                <List dense>
                  {loading && (
                    <ListItem>
                      <Spinner />
                    </ListItem>
                  )}
                  <ListItem>
                    <ErrorPanel error={error} />
                  </ListItem>
                  {expandScopes &&
                    expandScopes.map(scope => (
                      <ListItem
                        key={scope}
                        button
                        component={Link}
                        to={`/auth/scopes/${encodeURIComponent(scope)}`}
                        className={classes.listItemButton}>
                        <ListItemText secondary={scope} />
                        <LinkIcon size={16} />
                      </ListItem>
                    ))}
                </List>
              )}
            </Query>
          )}
          <Button
            tooltipProps={{ title: 'Expand Scopes' }}
            spanProps={{ className: classes.actionButton }}
            color="secondary"
            variant="round"
            onClick={this.handleExpandScopesClick}>
            <ArrowExpandVerticalIcon />
          </Button>
        </Fragment>
      </Dashboard>
    );
  }
}
