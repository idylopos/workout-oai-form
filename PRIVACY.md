# Privacy model

Form is a static, local-first application. The published application contains
interface code, validation rules, and fictional demonstration data only.

Imported Markdown and JSON files are read and parsed in the browser. Workout
plans, session results, and notes are stored in the browser's IndexedDB database
for this site. The application has no analytics, account system, or application
server. It does not upload imported data.

Browser storage can be cleared by the user, browser, or operating system.
Exported JSON backups are therefore the durable copy of personal data. Store
those backups in an established encrypted vault.

Never commit personal workout plans, exported backups, medical notes, progress
photos, API credentials, or the private authoring workspace to this repository.
