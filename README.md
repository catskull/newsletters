# newsletters
Start your own newsletter!

## how to run
- clone repo
- cd into repo
- edit domain, repo, and github user in wrangler.toml
- create a github personal access token with the right permissions (which ones?) and set it as a secret either in the web ui or with wrangler
- `npx wrangler deploy`
- in cloudflare, go to your domain (zone), then email routes and map to your worker
- send an email from the same domain as your domain setting and it will commit to your github repo with a new jekyll html file under `/_newsletters`
