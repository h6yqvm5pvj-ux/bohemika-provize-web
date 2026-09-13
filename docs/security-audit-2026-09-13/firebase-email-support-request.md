# Firebase support request — ready to submit, not sent

Submit privately through [Firebase Support](https://firebase.google.com/support/troubleshooter/contact). Do not attach service-account keys, ID tokens, password-reset links, or account exports.

**Subject:** Authentication default email delivery: successful password-reset request, no email received

**Project:** `bohemikasmlouvy` (Firebase Authentication with Identity Platform)

**Issue:** The project owner reports that password-reset and verification emails have failed to arrive for a long time, including at both a company mailbox and Seznam.cz. The historical Seznam.cz attempts were reported by the owner, not independently observed during this investigation.

We reproduced the password-reset symptom independently of the website UI:

- One explicitly authorized request was made to `POST https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode`.
- Request body fields: `requestType: PASSWORD_RESET` and the owner's specified account email. No `returnOobLink`, tenant override, or custom continue URL was supplied. Locale header: `X-Firebase-Locale: cs`.
- Response completed at **2026-09-13 08:24:10.662 UTC** (**10:24:10.662 CEST**) with **HTTP 200**. Exactly one request; no automatic retry.
- The recipient reports that the message is absent from both provider webmail and Spam. We understand that HTTP 200 alone does not confirm mail delivery.
- Admin SDK lookup of only that recipient confirmed that the account exists, is enabled, and has the password provider. The recipient address can be supplied privately in the support case if necessary.
- The API key's canonical numeric project ID matches the Admin configuration's canonical project ID.
- Email/password authentication is enabled. Email enumeration protection is enabled; it was not disabled for testing.
- `notification.sendEmail.method = DEFAULT`; no custom SMTP, active custom sender domain, or pending custom sender domain.
- Both reset and verification templates use the default `noreply` sender local part. Reply-to values passed basic syntax checks and the sender headers contain no line breaks. Sender display names are unset. The templates' body/subject are not customized.
- The default Firebase action handler is configured and the client Auth domain is authorized. Multi-tenancy is disabled. No email/password reCAPTCHA enforcement was reported by the configuration response (state unspecified).
- Auth request activity logging is disabled. The service account used for this investigation cannot read Cloud Logging metadata (HTTP 403). No logging, IAM, sender settings, or account fields were changed.

**Please investigate:** Did this request create and dispatch an email? If not, please identify the applicable sender/project restriction, suppression, quota, configuration issue, or internal error. If dispatch was attempted, please provide the delivery/bounce status, time, and SMTP response without exposing the password-reset action link. Please advise how to restore default Google-managed email delivery for this project.

The application-side email-verification bypass has separately been removed from the local code. This security fix does not establish that Google's email transport is functioning. There has been no application deployment during this investigation.
