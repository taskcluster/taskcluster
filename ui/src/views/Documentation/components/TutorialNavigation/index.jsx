import Divider from '@material-ui/core/Divider';
import { makeStyles } from '@material-ui/core/styles';
import Typography from '@material-ui/core/Typography';
import { arrayOf, shape, string } from 'prop-types';
import { Fragment } from 'react';
import Anchor from '../Anchor';
import HeaderWithAnchor from '../HeaderWithAnchor';
import List from '../List';
import ListItem from '../ListItem';

// Render a "Next Steps" section with links to further tutorial
// sections.
const useStyles = makeStyles((theme) => ({
  divider: {
    margin: `${theme.spacing(3)}px 0`,
  },
}));

export default function TutorialNavigation({ children, links }) {
  const classes = useStyles();

  return (
    <Fragment>
      <Divider className={classes.divider} light />
      <HeaderWithAnchor type="h2">Next Steps</HeaderWithAnchor>
      <Typography variant="subtitle1">{children}</Typography>
      {links && (
        <List>
          {links.map(({ link, text }) => (
            <ListItem key={link}>
              <Anchor href={link.startsWith('/') ? link : `/docs/tutorial/${link}`}>{text}</Anchor>
            </ListItem>
          ))}
        </List>
      )}
    </Fragment>
  );
}

TutorialNavigation.propTypes = {
  children: string,
  links: arrayOf(
    shape({
      link: string,
      text: string,
    }),
  ),
};
