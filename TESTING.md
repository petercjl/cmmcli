# Validation scope

The portable entry accepts any Agent with Node.js 22+, command execution, local file access and an authenticated Chrome CDP session. Host names are not an eligibility list.

Package QA runs on GitHub-hosted macOS, Windows and Linux. It checks CLI parsing, installation/update ownership and metadata protection, same-version repair, locked-directory recovery, version/integrity drift, packed scripts-disabled installation, arbitrary host destinations and isolated runtime execution. The surviving isolated runtime creates and reopens a local Excel artifact after its bootstrap package and another host installation are removed.

Live Chanmama search and a clean-context Agent task have been exercised on macOS: two API pages, 50 rows per page, 100 distinct product IDs and an Excel file. Other OS/browser/Agent live service sessions require their own runtime evidence; CI package mechanics do not establish account or browser access.

This is the first functional public release. There is no archived-updater-entry or historical-mode runtime to migrate; the separate namespace bootstrap has no updater. Future releases must run supported old-to-new updater entries and the upgrade recovery matrix before publication. Business data, browser credentials, local paths and evaluation transcripts are excluded from distributed files.
