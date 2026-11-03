---
title: "Email Config — alanwoodyard.photo"
domain: alanwoodyard.photo
updated_at: "2026-05-23"
email_provider: iCloud Mail
type: reference
---

# Email Config: alanwoodyard.photo

**Provider:** iCloud Mail

## Email DNS Records

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:icloud.com ~all` |
| MX | `@` | `10 mx02.mail.icloud.com` |
| CNAME | `sig1._domainkey` | `sig1.dkim.alanwoodyard.photo.at.icloudmailadmin.com` |
| MX | `@` | `10 mx01.mail.icloud.com` |


## Notes

iCloud email configured. Points to AWS IP. www CNAME loops to root — may need correction.
