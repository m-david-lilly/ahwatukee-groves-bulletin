# Ahwatukee Groves Ward Bulletin: setup and weekly use

One Google Apps Script project, attached to the **Sacrament Meeting 2026 - Official** sheet, handles:

| Piece | Where it lives |
|---|---|
| Agenda | The existing **Current Week** tab (nothing changes in how you plan the program) |
| Announcement submissions | A phone-friendly form → **Bulletin Announcements** tab, as *Pending* |
| Approval | The **admin page** (private link), or the Status column on that tab |
| Electronic bulletin | The web app's main page, for phones and tablets. Shared through a short link. |
| Printed bulletin | Google Doc + PDF, Letter landscape: agenda on the left, announcements on the right |

Hosting is the Apps Script web app itself: free and run by Google, with nothing else to maintain.

## The four links

| Link | Who uses it |
|---|---|
| `…/exec` (via the short link) | Everyone: the electronic bulletin |
| `…/exec?page=submit` | Everyone: submit an announcement (also a button on the bulletin) |
| `…/exec?page=admin&key=…` | **Only you** (and anyone you choose): approve, edit, publish. Get it from **Bulletin → Admin page**. |
| `…/exec?preview=1` | You: see the live sheet before publishing |

## One-time setup

The code goes up with `clasp`, Google's command-line tool for Apps Script. Run these from the `ward-bulletin` folder.

1. Turn on the Apps Script API for your Google account: <https://script.google.com/home/usersettings>
2. Sign in to `clasp` (a browser window opens to approve):

   ```bash
   clasp login
   ```

3. Create a script attached to the spreadsheet, then upload the code:

   ```bash
   clasp create-script --title "Ward Bulletin" --parentId 1Lw_5aQDKWZgMUil8viD8zaNBNLMGk0tIwDDPxTIHHDA --rootDir apps-script
   ```

   ```bash
   clasp push --force
   ```

4. Reload the spreadsheet and approve the script's permissions (Sheets, Docs, Drive, email, fetching the QR-code image). Google will say the app isn't verified; choose **Advanced → Go to Ward Bulletin**. The first time anyone opens the web app, it creates the **Bulletin Settings** and **Bulletin Announcements** tabs and emails you the private admin link. **Bulletin → Setup → Create / repair bulletin tabs** does the same thing by hand.
5. Create the web app (anyone can view, runs as you):

   ```bash
   clasp create-deployment --description "Ward bulletin"
   ```

   Paste the URL it prints (ends in `/exec`) into **Web App URL** on the **Bulletin Settings** tab.
6. Make the short link (e.g. `tinyurl.com/ahwatukee-groves-bulletin`) pointing at the `/exec` URL. Put it in **Print Link**.
7. Fill in the rest of **Bulletin Settings** (Meeting Time, Presiding, …). Then run **Bulletin → Publish this week's bulletin**.
8. **Bulletin → Admin page** shows your private admin link. Bookmark it on your phone.
9. Optional: **Bulletin → Setup → Auto-publish every Saturday evening** (6 PM Arizona time).

### Updating the code later

Push the new code, then point the *same* deployment at it, so the `/exec` URL and short link never change:

```bash
clasp push --force
```

```bash
clasp list-deployments
```

```bash
clasp update-deployment <deployment-id-from-the-list> --description "update"
```

## Weekly routine

1. Ward members submit announcements. You get an email with a link straight to the admin page.
2. On the admin page, **Approve** or **Reject** each item under *Needs review*. Use **Edit** to fix typos, set dates, or give it an **Order** (1, 2, 3…) to pin it to the top.
3. When **Current Week** is final, tap **Publish bulletin** on the admin page (or use the menu in the sheet). Approved items don't appear on the bulletin until you publish.
4. Open the PDF and print it, or edit the Doc first if something needs a last-minute tweak.

**Which Sundays an announcement appears:** from *Start running* through *Stop after*. If *Stop after* is blank, it runs through the *Event date*. If both are blank, it runs until you **Archive** it. Announcements whose event date has passed drop off automatically. The admin page marks items in the upcoming bulletin with an "In … bulletin" badge.

**Standing items** (temple schedule, ward council contacts): add a row in the sheet with Status `Approved`, a high Order number, and no dates.

## Good to know

- **The admin link is the password.** Anyone with it can approve announcements and publish. It's sent only to the Notify Email. If it gets around, use **Bulletin → Setup → Reset admin link**; the old link stops working immediately.
- **The web page shows the last *published* version**, not the live sheet, so half-finished edits never appear on people's phones.
- **Page overflow:** on a busy week, lower **Print Font Size** to 10, or edit the Doc by hand.
- **Google banner:** web apps from personal Gmail accounts show a small "created by a Google Apps Script user" bar. That's normal.
- **When the calling changes hands:** the web app runs as whoever deployed it. Transfer ownership of the sheet to the new coordinator, and have them create a new deployment. Then point the short link at the new URL. (TinyURL links without an account can't be repointed, so make the short link with a ward account if you want to hand it over.)
- **Prayers:** if Invocation or Benediction is blank (or N/A) on Current Week, the bulletin shows **By Invitation**.
- **Hymn links:** each hymn number links to that hymn in Gospel Library: hymns 1–341 from *Hymns* (1985), and 1001+ from *Hymns—For Home and Church*. When the Church releases new hymns, `HymnLinks.gs` needs those numbers added. Until then, new hymns show without a link.
- **Fast Sunday** is detected automatically (Topic "Testimony Meeting" or "FAST SUNDAY" in a speaker slot): speakers are replaced with *Bearing of Testimonies*, and the intermediate hymn is dropped. If Stake/General Conference leaves the program empty, the Topic is shown as a notice.

## Testing locally

`node test/run.js` checks the agenda and announcement logic against a real Fast Sunday program and a regular-week example. It also writes previews of all three pages (bulletin, submit form, and admin with a fake server) to `preview/`.
