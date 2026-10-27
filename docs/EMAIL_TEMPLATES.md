# Editing admissions email templates

Open **Communications → Email Templates** in the admin portal. Select a template, edit its subject and message, check the sample preview, then select **Save template**. English and Tamil are supported.

The editor covers registration and application confirmations, staff submission alerts, application invitations, workshop bookings and reminders, interviews, final results, candidate access links, student reminders, personal candidate messages, and sender test notifications.

Copy the available `{{variable}}` tokens exactly. The portal fills them with the recipient's details when a new message is queued. Automatic links are added by the portal; templates with a link also offer a button label. Candidate access links retain their expiry notice.

## Form confirmations and staff alerts

Each existing form has its own confirmation and staff alert entry. These entries take priority over the shared confirmation and staff alert defaults. Use **Form sending settings** to choose recipients and enable or disable automatic sending in Builder.

The central editor stores plain text messages and escapes them for HTML emails. Existing Builder HTML stays intact until you save that form template in the central editor; saving there replaces its formatting with the edited plain text.

## Reminders and personal messages

Saved student reminder templates become the starting text on the Student Reminders page. Review the recipients and draft before sending. In the candidate email composer, select **Use saved message template** to insert the saved personal message template; you can then edit that draft.

## Save behavior

- Saving a template does not send email.
- New messages use the saved content. Emails already queued retain their original content.
- **Load default** prepares the default content in the editor. Select **Save template** to apply it.
- Unsaved changes must be saved or discarded before selecting another template.
- If another administrator changes the same template, reload and review the latest version before saving again.

Templates are stored in the existing admissions database snapshot. This feature needs no database migration or extra provider credentials.
