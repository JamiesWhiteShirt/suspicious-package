import { argv, exit } from "node:process";
import { promises } from "fs";
import NodeRSA from "node-rsa";

const { readFile } = promises;

if (argv.length !== 3) {
  console.error(`Expected a single argument, got ${argv.length - 2}`);
  exit(1);
}
const input = argv[2];

let privateKey;
try {
  const keyFile = await readFile("id_rsa");
  privateKey = new NodeRSA(keyFile);
} catch (e) {
  console.error(e);
  exit(1);
}

console.log(privateKey.decrypt(input, "utf8"));
