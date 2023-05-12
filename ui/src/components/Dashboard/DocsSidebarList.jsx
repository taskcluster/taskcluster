import React, { Fragment, Component } from 'react';
import { Link, withRouter } from 'react-router-dom';
import classNames from 'classnames';
import { lowerCase } from 'lower-case';
import { withStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import Divider from '@material-ui/core/Divider';
import Collapse from '@material-ui/core/Collapse';
import ChevronDownIcon from 'mdi-react/ChevronDownIcon';
import ChevronUpIcon from 'mdi-react/ChevronUpIcon';
import { DOCS_MENU_ITEMS, DOCS_PATH_PREFIX } from '../../utils/constants';
import removeReadmeFromPath from '../../utils/removeReadmeFromPath';
import docsTableOfContents from '../../../../generated/docs-table-of-contents.json';

const getDocsSectionFromPathname = pathname => {
  if (!pathname) {
    return null;
  }

  const item = DOCS_MENU_ITEMS.find(({ label }) => {
    if (pathname.startsWith(`${DOCS_PATH_PREFIX}/${lowerCase(label)}`)) {
      return true;
    }

    return false;
  });

  return item ? item.label : null;
};

@withRouter
@withStyles(theme => ({
  toc: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(3),
  },
  ul: {
    listStyle: 'none',
    paddingInlineStart: `${theme.spacing(2)}px`,
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
  },
  link: {
    textDecoration: 'none',
    padding: `0 ${theme.spacing(1)}px`,
    display: 'block',
  },
  linkActive: {
    color: theme.palette.secondary.main,
  },
  hover: {
    ...theme.mixins.hover,
  },
  header: {
    textTransform: 'uppercase',
    fontWeight: 'bold',
    letterSpacing: 1.3,
    fontSize: theme.typography.fontSize - 1,
  },
  section: {
    marginBottom: theme.spacing(1),
  },
  sectionDiv: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  collapse: {
    margin: `${theme.spacing(1)}px 0 ${theme.spacing(2)}px 0`,
    padding: `0 ${theme.spacing(2)}px`,
    overflowY: 'auto',
    maxHeight: '48vh',
  },
  listItem: {
    listStyle: 'none',
  },
  divider: {
    margin: `${theme.spacing(1)}px 0`,
  },
  inlineLink: {
    display: 'inline-block',
    textDecoration: 'none',
  },
  inlineLinksWrapper: {
    display: 'inline-block',
    '& span': {
      display: 'inline-block',
    },
  },
  childWithInlineNodes: {
    display: 'inline-block',
  },
  slashBar: {
    display: 'inline-block',
    padding: '0 2px',
  },
}))
export default class DocsSidebarList extends Component {
  state = {
    currentMenu: null,
    menuOpen: true,
    // eslint-disable-next-line react/no-unused-state
    previousPathname: null,
  };

  static getDerivedStateFromProps(props, state) {
    const { pathname } = props.history.location;
    const currentMenu = getDocsSectionFromPathname(pathname);
    const previousMenu = getDocsSectionFromPathname(state.previousPathname);
    const newState = {
      currentMenu,
      previousPathname: pathname,
    };

    if (
      currentMenu !== previousMenu ||
      // When a section is collapsed but the user clicks on "next" or "previous"
      (currentMenu === previousMenu &&
        !state.menuOpen &&
        state.previousPathname !== newState.previousPathname)
    ) {
      Object.assign(newState, { menuOpen: true });
    }

    return newState;
  }

  renderInlineNodes = nodes => {
    const {
      classes,
      history: { location },
    } = this.props;

    if (!nodes.length) {
      return null;
    }

    return (
      <div className={classes.inlineLinksWrapper}>
        <Typography variant="body2" component="span">
          (
        </Typography>
        {nodes.map((node, idx) => {
          const href = removeReadmeFromPath(`${DOCS_PATH_PREFIX}/${node.path}`);
          const isLinkActive = removeReadmeFromPath(location.pathname) === href;

          return (
            <Fragment key={node.name}>
              {idx !== 0 && (
                <Typography variant="body2" className={classes.slashBar}>
                  /
                </Typography>
              )}
              <Link
                className={classNames(classes.inlineLink, classes.hover)}
                to={href}>
                <Typography
                  variant="body2"
                  className={classNames({
                    [classes.linkActive]: isLinkActive,
                  })}
                  component="span">
                  {node.name}
                </Typography>
              </Link>
            </Fragment>
          );
        })}
        <Typography variant="body2" component="span">
          )
        </Typography>
      </div>
    );
  };

  shouldRenderNode = node =>
    !(
      !node.children ||
      (node.path.includes('README') && !node.children.length)
    );

  renderNode = (node, isRoot = false) => {
    const {
      classes,
      history: { location },
    } = this.props;
    const href = removeReadmeFromPath(`${DOCS_PATH_PREFIX}/${node.path}`);
    const isLinkActive = removeReadmeFromPath(location.pathname) === href;

    if (node.children && node.children.length) {
      const [nodes, inlineNodes] = node.children.reduce(
        (acc, curr) => {
          if (curr.data.inline) {
            acc[1].push(curr);
          } else {
            acc[0].push(curr);
          }

          return acc;
        },
        [[], []]
      );
      const hasInlineNodes = inlineNodes.length > 0;

      return (
        <Fragment key={node.path}>
          {isRoot && node.prev && <Divider className={classes.divider} />}
          <Link to={href}>
            <Typography
              variant="body2"
              className={classNames(classes.link, classes.hover, {
                [classes.header]: isRoot,
                [classes.linkActive]: isLinkActive,
                [classes.childWithInlineNodes]: hasInlineNodes,
              })}>
              {node.data.title || node.name}
            </Typography>
          </Link>
          {hasInlineNodes && this.renderInlineNodes(inlineNodes)}
          <ul className={classes.ul}>
            {nodes.map(
              child =>
                this.shouldRenderNode(child) && (
                  <li key={child.path}>{this.renderNode(child)}</li>
                )
            )}
          </ul>
        </Fragment>
      );
    }

    return (
      <Link to={href}>
        <Typography
          variant="body2"
          className={classNames(classes.link, classes.hover, {
            [classes.linkActive]: isLinkActive,
            [classes.header]: isRoot,
          })}
          key={node.path}>
          {node.data.title}
        </Typography>
      </Link>
    );
  };

  handleSectionClick = ({ currentTarget: { name } }) => {
    const { currentMenu, menuOpen } = this.state;

    if (name === currentMenu) {
      this.setState({ menuOpen: !menuOpen });
    } else {
      this.setState({ menuOpen: true });
    }
  };

  render() {
    const { classes } = this.props;
    const { currentMenu, menuOpen } = this.state;

    return (
      <div className={classes.toc}>
        {DOCS_MENU_ITEMS.map(item => (
          <Fragment key={item.label}>
            {item.hasChildren && <Divider />}
            <Link to={removeReadmeFromPath(item.path)}>
              <ListItem
                name={item.label}
                button
                onClick={this.handleSectionClick}
                classes={{ container: classes.listItem }}>
                <ListItemIcon>
                  <item.icon />
                </ListItemIcon>
                <ListItemText primary={item.label} />
                {item.hasChildren &&
                  (menuOpen && currentMenu === item.label ? (
                    <ChevronUpIcon />
                  ) : (
                    <ChevronDownIcon />
                  ))}
              </ListItem>
            </Link>
            <Collapse
              in={item.hasChildren && menuOpen && currentMenu === item.label}>
              <div className={classes.collapse}>
                {docsTableOfContents[lowerCase(item.label)] &&
                  docsTableOfContents[
                    lowerCase(item.label)
                  ].children.map(child => this.renderNode(child, true))}
              </div>
            </Collapse>
          </Fragment>
        ))}
      </div>
    );
  }
}
