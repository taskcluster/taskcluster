import { hot } from 'react-hot-loader';
import React, { Component, Fragment } from 'react';
import { Query } from 'react-apollo';
import CodeEditor from '@mozilla-frontend-infra/components/CodeEditor';
import Spinner from '@mozilla-frontend-infra/components/Spinner';
import { withStyles } from '@material-ui/core/styles';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
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
    marginBottom: theme.spacing(2),
  },
  title: {
    marginBottom: theme.spacing(2),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
    paddingTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
    display: 'flex',
    justifyContent: 'space-between',
  },
}))
export default class ScopesetExpander extends Component {
  constructor(props) {
    super(props);

    const query = parse(this.props.location.search.slice(1));
    const { scopes } = query;

    if (scopes) {
      this.state = {
        scopeText: scopes.join('\n'),
      };
    } else {
      this.state = {
        scopeText: '',
      };
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
        title="Expand Scopes"
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
                        <Link key={scope} to={scopeLink(scope)}>
                          <ListItem button className={classes.listItemButton}>
                            <code
                              // eslint-disable-next-line react/no-danger
                              dangerouslySetInnerHTML={{
                                __html: formatScope(scope),
                              }}
                            />
                            <LinkIcon size={16} />
                          </ListItem>
                        </Link>
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
