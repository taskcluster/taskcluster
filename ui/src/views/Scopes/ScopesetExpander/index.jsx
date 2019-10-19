import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Query } from 'react-apollo';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import Typography from '@material-ui/core/Typography';
import ArrowExpandVerticalIcon from 'mdi-react/ArrowExpandVerticalIcon';
import LinkIcon from 'mdi-react/LinkIcon';
import { parse, stringify } from 'qs';
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
  };

  componentDidMount() {
    const query = parse(this.props.location.search.slice(1));
    const { scopes } = query;

    if (scopes) {
      this.setState(() => ({
        scopeText: scopes.join('\n'),
      }));
    }
  }

  handleExpandScopesClick = async () => {
    const scopes = splitLines(this.state.scopeText);
    const queryObj = { scopes };
    const queryStr = stringify(queryObj);

    this.props.history.push({
      pathname: '/auth/scopes/expansions',
      search: queryStr,
    });

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
