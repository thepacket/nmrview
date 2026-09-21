# Security and privacy

NMRView is research and education software, not a validated clinical workstation. Security fixes target the current `main` branch; there are no supported long-term release branches.

## Report a vulnerability privately

Use GitHub's **Security → Report a vulnerability** when available. Do not disclose exploitable details, keys, or patient information in a public issue or discussion. If private reporting is unavailable, open a minimal issue requesting a private contact channel without describing the vulnerability. No response-time guarantee is offered.

Include the affected commit, browser/runtime version, impact, and minimal reproduction using synthetic data. Never include a real API key or identifying scan.

## Data handling

Scans are processed locally in the browser. Browser-persisted annotations, collection metadata, and exported sessions may contain sensitive information. Optional assistant messages, selected metadata, and explicitly attached image previews are sent directly to OpenRouter and its selected model provider. The user-supplied API key is held in tab memory and is cleared on reload or by **Forget key**. Provider policies apply to transmitted content; clearing local chat cannot recall it.

Treat repository descriptions, case documents, imported files, and model responses as untrusted. See the [user guide](docs/USER_GUIDE.md) for import limits and sharing behavior.
