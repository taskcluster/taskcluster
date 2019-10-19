import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Query } from 'react-apollo';
import { parse, stringify } from 'qs';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import HelpView from '../../../components/HelpView';
import Dashboard from '../../../components/Dashboard/index';
import Button from '../../../components/Button';
import ErrorPanel from '../../../components/ErrorPanel';
import splitLines from '../../../utils/splitLines';
import Link from '../../../utils/Link';
import scopesetQuery from './scopeset.graphql';
import { formatScope, scopeLink } from '../../../utils/scopeUtils';

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
    scopes: splitLines(
      parse(this.props.location.search.slice(1)).expandScope || ''
    ),
  };

  handleExpandScopesClick = async () => {
    const scopes = splitLines(this.state.scopeText);

    this.setState({ scopes });
  };

  handleScopesChange = scopeText => {
    this.setState({ scopeText });
    const query = parse(this.props.location.search.slice(1));

    if (scopeText) {
      query.expandScope = scopeText;
    } else {
      delete query.expandScope;
    }

    this.props.history.replace(
      `/auth/scopes/expansions${stringify(query, { addQueryPrefix: true })}`
    );
  };

  render() {
    const { classes } = this.props;
    const { scopes } = this.state;
    const description = `This tool allows you to find the expanded copy of a given scopeset, with 
    scopes implied by any roles included.`;
    const query = parse(this.props.location.search.slice(1));

    return (
      <Dashboard
        title="Expand Scopes"
        helpView={<HelpView description={description} />}>
        <Fragment>
          <CodeEditor
            className={classes.editor}
            onChange={this.handleScopesChange}
            placeholder="new-scope:for-something:*"
            mode="scopemode"
            value={query.expandScope || ''}
          />
          {scopes && (
            <Query query={scopesetQuery} variables={{ scopes }}>
              {({ loading, error, data }) => (
                <Fragment>
                  <ErrorPanel error={error} />
                  <List dense>
                    {loading && (
                      <ListItem>
                        <Spinner />
                      </ListItem>
                    )}
                    {data &&
                      data.expandScopes &&
                      data.expandScopes.map(scope => (
                        <ListItem
                          key={scope}
                          button
                          component={Link}
                          to={scopeLink(scope)}
                          className={classes.listItemButton}>
                          <ListItemText
                            disableTypography
                            secondary={
                              <Typography>
                                <code
                                  // eslint-disable-next-line react/no-danger
                                  dangerouslySetInnerHTML={{
                                    __html: formatScope(scope),
                                  }}
                                />
                              </Typography>
                            }
                          />
                          <LinkIcon size={16} />
                        </ListItem>
                      ))}
                  </List>
                </Fragment>
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
