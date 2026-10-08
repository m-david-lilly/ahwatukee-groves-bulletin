# Ahwatukee Groves Ward Bulletin

One system for the electronic and printed sacrament meeting bulletin, driven by the **Sacrament Meeting 2026 - Official** spreadsheet.

| Piece | Where it lives |
|---|---|
| Agenda | The existing **Current Week** tab. Nothing changes in how you plan the program. |
| Website (bulletin, submit form, admin page) | GitHub Pages, from the `docs/` folder. No Google banner. |
| Data and printing | Apps Script attached to the spreadsheet (`apps-script/`). It answers the website with JSON and builds the Doc/PDF. |
| Announcements | **Bulletin Announcements** tab. Submissions arrive as *Pending*. |
| Settings | **Bulletin Settings** tab (ward name, times, deadline, links…) |

## Links

| Link | Who uses it |
|---|---|
| **tinyurl.com/agw-bulletin** → <https://m-david-lilly.github.io/ahwatukee-groves-bulletin/> | Everyone: the electronic bulletin, with Download PDF and Submit buttons |
| `…/submit.html` | Everyone: submit an announcement |
| `…/admin.html#key=…` | **Only you** (and anyone you choose): approve, edit, publish. It's in your setup email, or under **Bulletin → Admin page** in the sheet. |
| `…/?preview=1` | You: see the live sheet before publishing |

## Weekly routine

1. Ward members submit announcements. You get an email with a link to the admin page.
2. On the admin page, **Approve** or **Reject** each item under *To review*. Use **Edit** to fix typos, set dates, or give it an **Order** (1, 2, 3…) to pin it to the top.
3. When **Current Week** is final, tap **Publish bulletin**. The website updates, and a fresh PDF is made.
4. Tap **PDF** to print, or **Edit Doc** for a last-minute tweak first.

Optional: **Bulletin → Setup → Auto-publish every Saturday evening** (6 PM Arizona time). It emails you the PDF link.

**Which Sundays an announcement appears:** from *Start running* through *Stop after*. If *Stop after* is blank, it runs through the *Event date*. A submission with neither date runs for one Sunday: the form fills in *Stop after* for it. To keep an item running until you **Archive** it, clear *Stop after* (and leave the event date blank) with **Edit** on the admin page. Items whose event date has passed drop off automatically.

**Ward website activities:** the admin page's **Ward site** tab lists upcoming ward and stake activities from the ward's page on churchofjesuschrist.org. **Add as announcement** copies one in as a *Pending* announcement (with the date, time and place filled in) for you to edit and approve. The tab reads the same unofficial feed the ward page uses. If the Church changes it, the tab shows an error and everything else keeps working. The feed address is the **Ward Activities Feed** setting, and clearing it turns the tab off.

**Standing items** (temple schedule, ward council contacts): add a row in the sheet with Status `Approved`, a high Order number, and no dates.

## Good to know

- **The admin link is the password.** Anyone with it can approve and publish. The key sits after `#` in the link, so it's never sent to GitHub. If it gets around, use **Bulletin → Setup → Reset admin link**; the old one stops working immediately.
- **The website shows the last *published* bulletin.** Phones also keep the last bulletin they loaded, so it still opens on weak chapel Wi-Fi.
- **The PDF is public** ("anyone with the link can view") so the Download button works. The editable Doc stays private.
- **Order and page fit:** announcements are listed chronologically (soonest event first; undated items last, by **Order**). The printed bulletin always fits on one page: if they don't all fit, the ones with the latest dates are left off the paper copy, with a "+ N more announcements online" line. The website always shows all of them, and the admin page says how many made it onto paper. To fit more, lower **Print Font Size** to 10 or shorten long announcements.
- **Prayers:** a blank or N/A Invocation or Benediction shows **By Invitation**.
- **Hymn links** open the hymn in Gospel Library. New hymns released later need adding to `apps-script/HymnLinks.gs`.
- **Fast Sunday** is detected automatically. Speakers become *Bearing of Testimonies*, and the intermediate hymn is dropped.

## Changing the code

**Website** (`docs/`): commit and push. GitHub Pages updates in about a minute.

```bash
git push
```

**Apps Script** (`apps-script/`): push the code, then update the *same* deployment, so the data address in `docs/api.js` never changes.

```bash
clasp push --force
```

```bash
clasp update-deployment AKfycbw-Cb7mE0-v5aSE7MFxccmJ_NhMenz6HFykGV3Xo3IYLNhfteh_e4BfXQj3Sim6dANk
```

Adding a setting? Add it to `SETTING_DEFAULTS` and bump `SETUP_VERSION`. The next website visit adds it to the Settings tab.

**Tests:** `node test/run.js` checks the agenda and announcement logic. It also builds `preview/`, a copy of the site that runs against a fake server.

## Handing the calling to someone else

The data service runs as the Google account that deployed it.
1. Transfer ownership of the spreadsheet (and the **Ward Bulletins** Drive folder) to the new coordinator.
2. They run `clasp login`, then `clasp create-deployment`.
3. Put the new `/exec` address in `docs/api.js`, and transfer the GitHub repo or add them as a collaborator.

The short link points at the GitHub Pages address, which doesn't change.
