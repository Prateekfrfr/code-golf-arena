# Problem sources and licensing

Code Golf Arena ships only a small original development catalog. The import
pipeline is provided so a deployment can connect a larger catalog without
copying unlicensed problem statements or hidden tests into this repository.

## Source requirements

Every configured source must provide:

- an SPDX license identifier approved by the deployment's license policy
- attribution text when the license requires it
- a stable source locator
- an immutable revision, such as a full Git commit SHA
- permission to redistribute statements, examples, starter code, and tests

The default policy accepts only explicitly configured licenses. A missing or
unapproved license fails before repository writes.

## GitHub provider safety

The GitHub provider accepts an injected `fetch` implementation and requires:

- `api.github.com` or another explicitly allowlisted API host
- an explicitly allowlisted owner
- a full 40-character commit SHA
- JSON files only
- bounded file counts and response sizes
- request timeouts
- no redirects to unapproved hosts

The provider never executes repository scripts. Parsed records still pass
through canonical schema validation before sync planning.

## Filesystem provider safety

The filesystem provider resolves every file beneath an approved root, rejects
path traversal and symbolic links, reads JSON only, and enforces per-file and
aggregate limits.

## Connecting a dataset

1. Review the repository license and dataset-specific terms.
2. Configure the license allowlist and attribution.
3. Pin an immutable source revision.
4. Run a dry sync and inspect duplicates, inserts, updates, and archives.
5. Apply the sync through a transactional database repository.
6. Preserve source URL, revision, license, and attribution on every version.

Do not ingest repositories whose license covers code but not problem
statements, editorial explanations, or test data. When redistribution rights
are unclear, keep only the provider infrastructure and require the operator to
connect their own licensed source.
