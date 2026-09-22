# Contributing to NMRView

Use [Discussions](https://github.com/thepacket/nmrview/discussions) for questions and early ideas, and [Issues](https://github.com/thepacket/nmrview/issues) for reproducible defects or concrete requests. Discuss substantial changes before implementing them.

## Development

1. Fork and clone the repository; create a focused branch.
2. Use Node.js 22.13+ and run `npm ci`, then `npm run dev`.
3. Keep images central to the interface and preserve orientation, geometry, and source data. Avoid unnecessary public-repository traffic; use mocked requests in automated tests.
4. Run `npm run typecheck`, `npm test`, and `npm run build`. Run relevant `scripts/test-*.mts` regression scripts with `node --experimental-strip-types`; explain the checks performed in your pull request. `npm start` serves the static export locally, and `docker build .` verifies the deployable image.
5. For UI changes, check desktop and narrow layouts and include screenshots using synthetic or public de-identified data. Describe limitations and any checks you could not perform.

Do not commit API keys, credentials, patient information, private scans, build output, or local runtime state. Deployments to Fly.io (see the README) are run by the maintainer; pull requests should not change `fly.toml` without discussion. Do not introduce automatic AI sharing. Original data must remain available when adding processing features.

Keep pull requests focused and explain the problem, resulting behavior, and validation. New dependencies and sample data must include compatible licensing and attribution. Contributions to original project code are submitted under the project's MIT license; retain third-party notices.

Be respectful and constructive. Do not post identifying clinical information in issues, discussions, screenshots, or logs. Functional tests do not establish clinical validity.

## Spectroscopy changes

Keep the [spectroscopy guide](docs/SPECTROSCOPY.md), the [user guide](docs/USER_GUIDE.md) and README consistent when changing supported formats or workflows. Distinguish filename-based candidates from validated acquisitions. Document numerical assumptions, units, required inputs and optional dependencies; never imply that basis amplitudes are absolute concentrations.

Run focused spectroscopy checks as applicable:

```sh
node --experimental-strip-types scripts/test-spectroscopy-analysis.mts
node --experimental-strip-types scripts/test-mrs-support.mts
node --experimental-strip-types scripts/test-repository-traffic.mts
node --experimental-strip-types scripts/test-idc.mts
```

The supporting-file tests use mocked downloads. Preserve repository pacing, bounded requests, cancellation and explicit pagination; avoid live repository traffic in automated tests. For browser checks, record the public source and tested acquisition, including any explicit unit override. Failed optional-file discovery must not block spectrum viewing, and automatic basis discovery must not bypass compatibility checks or operator confirmation.
