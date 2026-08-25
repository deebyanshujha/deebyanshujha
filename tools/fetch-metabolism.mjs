#!/usr/bin/env node
/**
 * fetch-metabolism.mjs
 *
 * Reads the real contribution calendar and prints the environment variables
 * the generator understands.
 *
 * Anything that goes wrong here exits 0 with no output on purpose: the
 * generator then reuses the last good reading stored in the genome, so the
 * organism can never appear dead just because an API call had a bad day.
 */
const user = process.env.ORG_USER || 'deebyanshujha';
const token = process.env.GITHUB_TOKEN;

try {
  if (!token) throw new Error('no token in environment');

  const query = `query($u:String!){
    user(login:$u){
      repositories(privacy:PUBLIC, ownerAffiliations:OWNER){ totalCount }
      contributionsCollection{
        contributionCalendar{
          totalContributions
          weeks{ contributionDays{ contributionCount } }
        }
      }
    }
  }`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { u: user } }),
  });
  const json = await res.json();
  const u = json?.data?.user;
  if (!u) throw new Error('no user data: ' + JSON.stringify(json).slice(0, 220));

  const cal = u.contributionsCollection.contributionCalendar;
  const weeks = cal.weeks.map((w) => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  const days = cal.weeks.flatMap((w) => w.contributionDays);
  const active = days.filter((d) => d.contributionCount > 0).length;

  console.log([
    `ORG_COMMITS=${cal.totalContributions}`,
    `ORG_ACTIVE_DAYS=${active}`,
    `ORG_REPOS=${u.repositories.totalCount}`,
    `ORG_WEEKS=${weeks.join(',')}`,
  ].join('\n'));
} catch (err) {
  console.error('metabolism unreadable, keeping last known reading:', err.message);
}
