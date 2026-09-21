# Contributing to NMRView

Use [Discussions](https://github.com/thepacket/nmrview/discussions) for questions and early ideas, and [Issues](https://github.com/thepacket/nmrview/issues) for reproducible defects or concrete requests. Discuss substantial changes before implementing them.

## Development

1. Fork and clone the repository; create a focused branch.
2. Use Node.js 22.13+ and run `npm ci`, then `npm run dev`.
3. Keep images central to the interface and preserve orientation, geometry, and source data. Avoid unnecessary public-repository traffic; use mocked requests in automated tests.
4. Run `npm run typecheck`, `npm test`, and `npm run build`. Run relevant `scripts/test-*.mts` regression scripts with `node --experimental-strip-types`; explain the checks performed in your pull request.
5. For UI changes, check desktop and narrow layouts and include screenshots using synthetic or public de-identified data. Describe limitations and any checks you could not perform.

Do not commit API keys, credentials, patient information, private scans, build output, or local runtime state. Do not introduce automatic AI sharing. Original data must remain available when adding processing features.

Keep pull requests focused and explain the problem, resulting behavior, and validation. New dependencies and sample data must include compatible licensing and attribution. Contributions to original project code are submitted under the project's MIT license; retain third-party notices.

Be respectful and constructive. Do not post identifying clinical information in issues, discussions, screenshots, or logs. Functional tests do not establish clinical validity.
