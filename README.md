# Github Actions security research

A proof-of-concept npm package that exploits weak configuration of GitHub Actions and `actions/checkout` to write unexpected comments on pull requests.

## Disclaimer

**DO NOT INSTALL THIS PACKAGE!!! THE METHODS USED IN THIS PACKAGE ARE ONLY USED FOR RESEARCH PURPOSES. I DO NOT ENDORSE USING THESE METHODS FOR ANY PURPOSE EXCEPT RESEARCH.**

## Prerequisites

- A GitHub repository with default workflow permissions set to read + write.
- Dependency on this package, either directly or transitively.
- A workflow that uses `actions/checkout` followed by a step that installs packages with a JavaScript package manager that runs install scripts such as npm, Yarn or pnpm.

## How it works

In summary, using an install script the package extracts GitHub Actions credentials from git configuration made by `actions/checkout`, and uses it to access the GitHub API.

A workflow using npm typically has a job using a variant of the following steps:

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: actions/setup-node@v3
  - run: npm ci
```

Each job in a workflow has a secret called `GITHUB_TOKEN`, which is an access token that grants access to the GitHub API, with a scope limited to the current repository. The token can also be used to authenticate with git. You can read more about `GITHUB_TOKEN` in the [GitHub Docs](https://docs.github.com/en/actions/security-guides/automatic-token-authentication).

Shell command such as the third step in the example do not have access to `GITHUB_TOKEN` unless configured as an environment variable. Normally, this whould ensure that if malicious code runs in the shell command (hint: it will), it can't use the token to do harm.

`actions/checkout` has implicit access to `GITHUB_TOKEN`, and uses it to authenticate with git. Unlike shell commands, all actions are granted implicit access to the token, so that they can integrate with GitHub to do useful things such as reading/writing repository contents, publishing packages and writing test coverage reports.

In the first step of the example, `actions/checkout` uses its implicit access to `GITHUB_TOKEN` to configure git with `GITHUB_TOKEN` as a credential for authenticated git commands, then clones the repository, completing the checkout.

The second step is not directly relevant to the exploit.

The third step is where the malicious package can take control. When running `npm ci` (or `npm i`/`npm install`), npm runs install scripts on installed packages. This allows packages to run arbitrary scripts. Normally these scripts are used for the purpose of doing additional work to install a package such as installing binaries, but they can easily be used for malicious purposes.

By adding an `install` script to the `package.json` of the malicious package, it can run arbitrary commands in the GitHub actions workspace when the package is installed as a dependency. It uses the command to run the `install.js` script.

Because `actions/checkout` wrote `GITHUB_TOKEN` into git configuration, the token can be accessed in the third step, despite how the step is not configured have access to it. It is set in the git configuration as the `http.https://github.com/.extraheader` option with the value `AUTHORIZATION: basic base64Encode(x-access-token:GITHUB_TOKEN)`. In this format, the token can easily be extracted from the option, which is exactly what `install.js` does.

To demonstrate the its access to `GITHUB_TOKEN`, the package uses it to authenticate with the GitHub API, and leaves a comment if it runs in a workflow on a pull request.

## How to prevent getting pwned by this attack

GitHub Actions seems to built with the mantra of prioritizing convenience, sometimes at the cost of security. You should generally review the settings of both GitHub Actions itself and the actions you run to limit access to only that which is required for your workflow to work.

### `with.persist-credentials: false`

The `persist-credentials` option of `actions/checkout` keeps credentials stored in local git config after the action is complete. Unfortunately, this option is enabled by default. When disabled, credentials are removed from the git configuration before the action completes.

This option should be left enabled only when you intend to perform authenticated actions with git such as pushing tags or commits.

### Restrict workflow permissions

GitHub has two sets of default permissions for `GITHUB_TOKEN`, "permissive" and "restricted". The "permissive" set of permissions grants read/write access to almost everything in the repository, while "restricted" grants read-only access. You can see the full sets of default permissions in the [GitHub Docs](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token).

Historically, "permissive" has been the default setting, and it is still very common today. In February 2023, the default setting for enterprises, organizations and repositories was changed from "permissive" to "restricted". This change was not retroactive, meaning anything that was set up before February 2023 keeps "permissive" as the default unless configured otherwise. You can read more about changing the default setting on the [GitHub Blog post](https://github.blog/changelog/2023-02-02-github-actions-updating-the-default-github_token-permissions-to-read-only/).

It is good practice to be restrictive about the permissions granted to a workflow. You can either define a minimal set of permissions per workflow/job with `job.<job_id>.permissions` (see [Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idpermissions)) or use the "restricted" default permissions.

### `npm i --ignore-scripts`

The `--ignore-scripts` option prevents running the install script. However, this applies to scripts in all packages, meaning packages using install scripts for legitimate reasons could break.

You can read more about the security implications about package install scripts in [this npm blog post](https://blog.npmjs.org/post/141702881055/package-install-scripts-vulnerability).
