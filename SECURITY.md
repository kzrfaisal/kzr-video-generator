# Security policy

## Supported versions

Security fixes are applied to the latest code on the default branch. There are no separately supported release lines yet.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository. If that feature is unavailable, contact the repository owner privately through the contact method listed on their GitHub profile.

Include a concise description, reproduction steps, affected files or routes, and the potential impact. Do not include real API keys, access tokens, private videos, or other user data.

## Deployment warning

KZR Video Generator is designed as a single-user application running on a trusted local machine. It has no authentication or tenant isolation, and its server routes can:

- start paid OpenAI API requests;
- read and write generated projects on local disk;
- render media through local FFmpeg processes; and
- publish to configured YouTube or Instagram accounts.

Do not bind it to a public network interface or deploy it as a public service without first adding authentication, authorization, request validation, rate limiting, isolated storage, and a hardened job execution model.

Keep `.env` private. If a credential is ever committed or shared, revoke it at the provider immediately; removing it from the latest commit is not sufficient.
