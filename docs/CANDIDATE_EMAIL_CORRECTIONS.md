# Candidate email corrections

Administrators can use **Edit email** beside a candidate in Registrations or Applications. The same candidate identity supplies contact details to registrations, applications, reminders and new email messages. Corrections require the displayed previous address, reject another candidate's address, and commit atomically with an audit entry. A repeated save of the same correction is safe; competing corrections require refreshing.

Email syntax, length and common invalid `.com` suffix typos (`.con`, `.comm`, `.cmo`, `.comn`, `.cpm`) are checked by a shared validator. Public forms show the suggestion on blur and before submission; server validation also covers direct API submissions and custom fields mapped to the candidate email. Addresses are trimmed/lowercased; suggestions are never applied silently. Valid custom and country domains such as `.lk`, `.co`, `.cm` and `.om` remain accepted. The validator does not prove mailbox ownership or inbox delivery.

An email correction updates linked main-email form answers. Guardian/alternate email questions are preserved. Old-address queued/failed messages pause for review; uncertain jobs retain their unconfirmed status and cannot be retried to the old address. Already accepted messages keep their original recipient/provider history. Corrections do not send mail. The administrator composes a new message to the corrected contact when appropriate.

Related stale Sheet export jobs pause too. Re-export linked records to update connected Sheets; old accepted exports are shown as out of date until a fresh export succeeds. An in-flight message/export must finish before editing its candidate's email.

Public form/API and correction endpoint tests use isolated temporary storage and mocked providers. Browser QA should use invalid example addresses and cancel without changing a real candidate's contact.

Reference: [IANA root-zone suffix list](https://data.iana.org/TLD/tlds-alpha-by-domain.txt), checked 2026-10-26, and [HTML email input validation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/email).
