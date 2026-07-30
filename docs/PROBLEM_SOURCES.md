# Problem sources and licensing

Code Golf Arena ships a 61-problem original catalog and uses local authoring as
the product source of truth. Runtime GitHub, Alfa, LeetCode, and other remote
problem APIs are intentionally not supported.

## Source requirements

Every reviewed local import must provide:

- an SPDX license identifier approved by the deployment's license policy
- attribution text when the license requires it
- a stable source locator
- an immutable local revision identifier
- permission to redistribute statements, examples, starter code, and tests

The default policy accepts only explicitly configured licenses. A missing or
unapproved license fails before repository writes.

## Filesystem provider safety

The filesystem provider resolves every file beneath an approved root, rejects
path traversal and symbolic links, reads JSON only, and enforces per-file and
aggregate limits.

## Importing a reviewed local dataset

1. Review the dataset license and dataset-specific terms.
2. Configure the license allowlist and attribution.
3. Pin an immutable source revision.
4. Run a dry sync and inspect duplicates, inserts, updates, and archives.
5. Apply the sync through a transactional database repository.
6. Preserve source URL, revision, license, and attribution on every version.

Do not ingest datasets whose license covers code but not problem
statements, editorial explanations, or test data. When redistribution rights
are unclear, do not import the material.
