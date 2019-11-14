import React, { Fragment } from 'react';
import Typography from '@material-ui/core/Typography';
import Grid from '@material-ui/core/Grid';
import BookOpenVariantIcon from 'mdi-react/BookOpenVariantIcon';
import OneTwoThreeIcon from 'mdi-react/OneTwoThreeIcon';
import BookOpenOutlineIcon from 'mdi-react/BookOpenOutlineIcon';
import OpenInNewIcon from 'mdi-react/OpenInNewIcon';
import Anchor from '../../components/Anchor';
import HeaderWithAnchor from '../../components/HeaderWithAnchor';
import ExploreCard from '../../components/ExploreCard';

const cards = [
  {
    title: 'Tutorial',
    description:
      'Learn about Taskcluster, focusing on the parts most relevant to you',
    icon: <OneTwoThreeIcon />,
    to: '/docs/tutorial',
  },
  {
    title: 'Manual',
    description: `A comprehensive description of ${window.env.APPLICATION_NAME}'s design and operation`,
    icon: <BookOpenVariantIcon />,
    to: '/docs/manual',
  },
  {
    title: 'Reference',
    description: 'Technical details of each component',
    icon: <BookOpenOutlineIcon />,
    to: '/docs/reference',
  },
  {
    title: 'Resources',
    description: `Presentations, external services, and useful links used by and for ${window.env.APPLICATION_NAME}`,
    icon: <OpenInNewIcon />,
    to: '/docs/resources',
  },
];

export default function GetStarted() {
  return (
    <Fragment>
      <HeaderWithAnchor>Documentation</HeaderWithAnchor>
      <Typography variant="body2">
        Taskcluster is the task execution framework that supports Mozilla&#39;s
        continuous integration and release processes.
      </Typography>
      <br />
      <Grid container spacing={2}>
        {cards.map(({ title, description, icon, to }) => (
          <Grid key={title} item sm={6} xs={12}>
            <ExploreCard
              title={title}
              description={description}
              icon={icon}
              to={to}
            />
          </Grid>
        ))}
      </Grid>
      <br />
      <br />
      <HeaderWithAnchor type="h2">People</HeaderWithAnchor>
      <Typography variant="body2">
        Find out more about the <Anchor href="/docs/people">people</Anchor> who
        make Taskcluster, and get involved yourself!
      </Typography>
      <br />
      <br />
      <HeaderWithAnchor type="h2">Questions?</HeaderWithAnchor>
      <Typography variant="body2">
        We&#39;re always happy to help with code or other questions you might
        have.{' '}
        <Anchor href="https://github.com/taskcluster/taskcluster/issues/new">
          Create an issue.
        </Anchor>
      </Typography>
    </Fragment>
  );
}
