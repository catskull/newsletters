import PostalMime from 'postal-mime';
import { Octokit } from "octokit";
import * as cheerio from 'cheerio';

export default {
  async email(message, env, ctx) {
    try {
      const utf8ToBase64Modern = (str) => {
        let bytes = new TextEncoder().encode(str);
        let binary = String.fromCharCode(...bytes);
        return btoa(binary);
      }

      if (message.from !== env.EMAIL) {
        message.setReject("Address not allowed");  
        return;
      }
      const email = await PostalMime.parse(message.raw, { attachmentEncoding: 'base64' });

      const messageId = email.messageId.replace('<','').replace('>','').split('@')[0];

      const repo = {
        owner: env.GITHUB_OWNER,
        repo: env.GITHUB_REPO,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      };
      const octokit = new Octokit({
        auth: env.TOKEN
      });

      // get latest master commit sha so we can create a branch
      const { data: ref } = await octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        ...repo,
        ref: `heads/${env.GITHUB_BRANCH}`,
      });
      const latestMasterCommitSha = ref.object.sha;

      // create a branch based on latest master sha
      try {
        await octokit.rest.git.createRef({
          ...repo,
          ref: `refs/heads/newsletter-${messageId}`,
          sha: latestMasterCommitSha,
        });
      } catch {
        console.log('failed to create branch (already exists?)')
      }

      // get the body of the email, html or text
      let body = false;
      if (email.html) {
        const $ = cheerio.load(email.html);
        $('meta').remove();
        body = $('body').html();
      } else {
        // just wrap each line in a <p> tag and call it a day
        body = email.text.split('\n').map(s => `<p>${s}</p>`).join('\n').trim();
      }

      // 2025-05-08
      const dateStamp = new Date().toISOString().split('T')[0];
      
      let newsletterHtml = `---
title: "${email.subject}"
created: ${dateStamp}
from: ${email.from.address}
---

${body}
`
      // commit each attachment, only dealing with inline images for now
      for (const attachment of email.attachments) {
        console.log(`committing ${attachment.filename}...`)
        const filepath = `assets/images/newsletters/${dateStamp}/${messageId}/${attachment.filename}`;

        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}',
        {
          ...repo,
          path: filepath,
          message: `Create ${attachment.filename}`,
          content: attachment.content,
          branch: `newsletter-${messageId}`,
        });
        console.log('done.')

        // email images use a "cid" for the source, update to the URL
        if (email.html) {
          newsletterHtml = newsletterHtml.replace(`cid:${attachment.contentId.replace('<', '').replace('>', '')}`, `/${filepath}`);
        } else {
        // otherwise just add the images to a new tag
          newsletterHtml += `
<img src="${`/${filepath}`}" alt="${attachment.filename}"/>
`
        }
      }

      // commit html last since we update for each inline image
      await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}',
      {
        ...repo,
        path: `_newsletters/${messageId}.html`,
        message: `Create ${messageId}.html`,
        content: utf8ToBase64Modern(newsletterHtml),
        branch: `newsletter-${messageId}`,
      });

      // create a pull request
      const { data: pr } = await octokit.rest.pulls.create({
        ...repo,
        title: `Newsletter: ${messageId}`,
        head: `newsletter-${messageId}`,
        base: `${env.GITHUB_BRANCH}`,
        body: `Automatically created from a message from ${email.from.address} with subject: ${email.subject}`,
      });

      // squash and merge
      await octokit.rest.pulls.merge({
        ...repo,
        pull_number: pr.number,
        merge_method: 'squash',
        commit_title: `Newsletter: ${email.subject}`,
        commit_message: `Processing email from ${message.from} with subject: ${email.subject}
Containing ${email.attachments ? email.attachments.length : 0} attachments.`,
      });

      // delete the branch
      await octokit.rest.git.deleteRef({
        ...repo,
        ref: `heads/newsletter-${messageId}`,
      });
    } catch (e) {
      console.log('Something fricked up')
      console.log(e)
    }
  }
}
