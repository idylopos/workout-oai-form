# Security

## Boundary

This repository and its GitHub Pages deployment are public. Personal workout
data belongs only in local browser storage and exported private backups.

## Reporting

If a deployment contains personal data, unpublish the GitHub Pages site,
remove the exposed artifact, review repository and Actions history, and rotate
any exposed credentials before republishing.

## Build checks

The Pages workflow builds a dedicated static artifact and runs a privacy scan
before upload. Only `pages-dist/` is deployed.

