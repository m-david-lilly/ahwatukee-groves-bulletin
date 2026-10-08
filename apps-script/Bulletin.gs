/**
 * Bulletin.gs — one tool for the electronic and printed ward bulletin.
 *
 *  - Agenda comes from the "Current Week" tab (label in column A, value in column B,
 *    date in D1), which the sheet already fills in for the upcoming Sunday.
 *  - Announcements come from the "Bulletin Announcements" tab. People submit them
 *    through the web app's form; only rows marked Approved are published.
 *  - "Bulletin > Publish" freezes a snapshot for the web bulletin and builds the
 *    landscape, two-column printable Doc + PDF from that same snapshot.
 */

var BULLETIN = {
  currentWeekSheet: 'Current Week',
  hymnsSheet: 'Hymns',
  announcementsSheet: 'Bulletin Announcements',
  settingsSheet: 'Bulletin Settings',
  publishedSheet: '_Bulletin Published',
  autoPublishHandler: 'autoPublishBulletin',
};

var ANNOUNCEMENT_HEADERS = ['Submitted', 'Status', 'Order', 'Title', 'Details', 'Event Date',
  'Run From', 'Run Through', 'Public Contact', 'Submitted By', 'Submitter Contact', 'Manager Notes', 'ID'];
// Bump when SETTING_DEFAULTS or the tab layout changes; the web app then upgrades the tabs itself.
var SETUP_VERSION = 4;
var ANNOUNCEMENT_STATUSES = ['Pending', 'Approved', 'Rejected', 'Archived'];

// Admin page field -> sheet column, with the longest text allowed.
var ADMIN_FIELDS = {
  status: ['Status'], order: ['Order'], title: ['Title', 120], details: ['Details', 3000],
  eventDate: ['Event Date'], runFrom: ['Run From'], runThrough: ['Run Through'],
  contact: ['Public Contact', 120], notes: ['Manager Notes', 500],
};

// Values an upgrade may overwrite because they were earlier defaults, not choices.
var REPLACED_DEFAULTS = {
  'Print Link': ['tinyurl.com/ahwatukee-groves-bulletin'],
  'Meeting Time': ['11:15 AM'],
};

var SETTING_DEFAULTS = [
  ['Ward Name', 'Ahwatukee Groves Ward', 'Shown at the top of both bulletins'],
  ['Stake Name', 'Tempe Arizona West Stake', 'Shown under the ward name (blank = leave off)'],
  ['Classes Time', '10:00 AM', 'When Sunday School / classes start (blank = leave off)'],
  ['Meeting Time', '11:10 AM', 'When sacrament meeting starts'],
  ['Ward Website', 'https://local.churchofjesuschrist.org/en/units/us/az/ahwatukee-groves-ward', 'Linked from both bulletins (blank = leave off)'],
  ['Location', '', 'Building name or address (optional)'],
  ['Presiding', '', 'Optional. Leave blank to leave the Presiding line off'],
  ['Notify Email', '', 'Gets an email for each new submission. Blank = no email'],
  ['Submission Deadline', 'Thursday at 5:00 PM', 'Shown on the form and bulletins'],
  ['Site URL', 'https://m-david-lilly.github.io/ahwatukee-groves-bulletin/', 'The bulletin website (GitHub Pages)'],
  ['Web App URL', 'https://script.google.com/macros/s/AKfycbw-Cb7mE0-v5aSE7MFxccmJ_NhMenz6HFykGV3Xo3IYLNhfteh_e4BfXQj3Sim6dANk/exec', 'Apps Script data address the website talks to (ends in /exec)'],
  ['Print Link', 'tinyurl.com/agw-bulletin', 'Optional short link (e.g. a bit.ly) printed instead of the long web address'],
  ['Print QR Code', 'Yes', 'Print a QR code to the electronic bulletin (Yes/No)'],
  ['Bulletin Folder', 'Ward Bulletins', 'Google Drive folder for the printable Docs and PDFs'],
  ['Print Font', 'Georgia', 'Any Google Docs font'],
  ['Print Font Size', 11, 'Lower this if a busy week spills onto a second page'],
  ['Footer', '', 'Optional line at the bottom of both bulletins'],
];

/* ---------------------------------------------------------------- menu */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Bulletin')
    .addItem('Publish this week\'s bulletin', 'publishBulletin')
    .addItem('Make printable bulletin only', 'printBulletinOnly')
    .addSeparator()
    .addItem('Admin page (approve announcements)', 'showAdminLink')
    .addItem('Review announcements in the sheet', 'openAnnouncements')
    .addItem('Web bulletin & submission links', 'showLinks')
    .addSeparator()
    .addSubMenu(ui.createMenu('Setup')
      .addItem('Create / repair bulletin tabs', 'setupBulletin')
      .addItem('Auto-publish every Saturday evening', 'enableAutoPublish')
      .addItem('Stop auto-publish', 'disableAutoPublish')
      .addItem('Reset admin link (if it was shared too widely)', 'resetAdminLink'))
    .addToUi();
}

function setupBulletin() {
  setupTabs_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert('Bulletin tabs are ready. Fill in "' + BULLETIN.settingsSheet +
    '", then use Bulletin > Admin page for your private admin link.');
}

/**
 * Creates any missing bulletin tabs the first time the web app is opened, then emails the
 * owner the private admin link, so setup doesn't depend on the spreadsheet menu.
 */
function ensureSetup_(ss) {
  var props = PropertiesService.getScriptProperties();
  function missing() {
    return !ss.getSheetByName(BULLETIN.settingsSheet) || !ss.getSheetByName(BULLETIN.announcementsSheet);
  }
  function outdated() { return props.getProperty('SETUP_VERSION') !== String(SETUP_VERSION); }
  if (!missing() && !outdated()) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var wasMissing;
  try {
    wasMissing = missing();
    if (!wasMissing && !outdated()) return;
    setupTabs_(ss); // keeps existing values; adds new settings and fills blanks with defaults
    props.setProperty('SETUP_VERSION', String(SETUP_VERSION));
  } finally {
    lock.releaseLock();
  }
  if (!wasMissing) return;
  var settings = readSettings_(ss);
  var to = settings['Notify Email'] || Session.getEffectiveUser().getEmail();
  if (to) {
    MailApp.sendEmail(to, 'Your ward bulletin is set up', [
      'The "' + BULLETIN.settingsSheet + '" and "' + BULLETIN.announcementsSheet + '" tabs were created in ' + ss.getName() + '.',
      '',
      'Your private admin page (approve announcements, publish). Bookmark it and keep it private:',
      adminUrl_(settings),
      '',
      'Bulletin for the ward: ' + (settings['Print Link'] || siteUrl_(settings)),
    ].join(String.fromCharCode(10)));
  }
}

function setupTabs_(ss) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());

  var ann = ss.getSheetByName(BULLETIN.announcementsSheet) || ss.insertSheet(BULLETIN.announcementsSheet);
  ann.getRange(1, 1, 1, ANNOUNCEMENT_HEADERS.length).setValues([ANNOUNCEMENT_HEADERS])
    .setFontWeight('bold').setBackground('#e8eef3');
  ann.setFrozenRows(1);
  var rows = ann.getMaxRows() - 1;
  ann.getRange(2, 2, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(ANNOUNCEMENT_STATUSES, true).build());
  ann.getRange(2, 1, rows, 1).setNumberFormat('m/d/yyyy h:mm am/pm');
  ann.getRange(2, 6, rows, 3).setNumberFormat('ddd m/d/yyyy');
  ann.getRange(2, 5, rows, 1).setWrap(true);
  [140, 95, 55, 220, 380, 115, 115, 115, 160, 140, 160, 200, 80].forEach(function (w, i) {
    ann.setColumnWidth(i + 1, w);
  });
  var status = ann.getRange(2, 2, rows, 1);
  ann.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Pending')
      .setBackground('#fff2cc').setRanges([status]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Approved')
      .setBackground('#d9ead3').setRanges([status]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('Rejected')
      .setFontColor('#999999').setRanges([status]).build(),
  ]);

  var set = ss.getSheetByName(BULLETIN.settingsSheet) || ss.insertSheet(BULLETIN.settingsSheet);
  var existing = readSettings_(ss);
  set.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Notes']]).setFontWeight('bold').setBackground('#e8eef3');
  SETTING_DEFAULTS.forEach(function (d, i) {
    var have = d[0] in existing && existing[d[0]] !== '' &&
      (REPLACED_DEFAULTS[d[0]] || []).indexOf(existing[d[0]]) === -1;
    var value = have ? existing[d[0]] : d[1];
    if (d[0] === 'Notify Email' && !(d[0] in existing)) value = Session.getEffectiveUser().getEmail();
    set.getRange(i + 2, 1, 1, 3).setValues([[d[0], value, d[2]]]);
  });
  set.getRange(2, 3, SETTING_DEFAULTS.length, 1).setFontColor('#777777');
  set.setColumnWidth(1, 170).setColumnWidth(2, 320).setColumnWidth(3, 460);
  set.setFrozenRows(1);

  var pub = ss.getSheetByName(BULLETIN.publishedSheet) || ss.insertSheet(BULLETIN.publishedSheet);
  if (!pub.isSheetHidden()) pub.hideSheet();
}

function openAnnouncements() {
  var sh = ss_().getSheetByName(BULLETIN.announcementsSheet);
  if (!sh) return setupBulletin();
  sh.activate();
}

function showLinks() {
  var settings = readSettings_();
  var url = siteUrl_(settings);
  if (!url) {
    return SpreadsheetApp.getUi().alert('Fill in "Site URL" on the ' + BULLETIN.settingsSheet + ' tab first.');
  }
  showDialog_('Bulletin links', [
    ['Electronic bulletin (share this)', settings['Print Link'] ? 'https://' + String(settings['Print Link']).replace(/^https?:\/\//, '') : url],
    ['Announcement submission form', url + 'submit.html'],
    ['Live preview (unpublished sheet data)', url + '?preview=1'],
  ]);
}

/* ------------------------------------------------------------- publish */

function publishBulletin() {
  var r = publish_(true);
  showDialog_('Bulletin published for ' + r.snap.dateLabel, [
    ['Electronic bulletin', r.web],
    ['Printable Google Doc (edit before printing if needed)', r.doc],
    ['PDF', r.pdf],
  ]);
}

function printBulletinOnly() {
  var r = publish_(false);
  showDialog_('Printable bulletin for ' + r.snap.dateLabel, [
    ['Printable Google Doc', r.doc],
    ['PDF', r.pdf],
  ]);
}

function publish_(toWeb) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = ss_();
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
    var settings = readSettings_(ss);
    var snap = buildSnapshot_(ss, settings);
    var files;
    try {
      files = createPrintBulletin_(snap, settings);
    } finally {
      // Publish the web version even if the print step fails; it just won't offer a PDF.
      if (files) { snap.pdf = files.pdf; snap.pdfDownload = files.pdfDownload; snap.doc = files.doc; }
      if (toWeb) savePublished_(ss, snap);
    }
    return { snap: snap, doc: files.doc, pdf: files.pdf, web: siteUrl_(settings) };
  } finally {
    lock.releaseLock();
  }
}

function enableAutoPublish() {
  disableAutoPublish(true);
  ScriptApp.newTrigger(BULLETIN.autoPublishHandler).timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(18)
    .inTimezone(ss_().getSpreadsheetTimeZone()).create();
  SpreadsheetApp.getUi().alert('The bulletin will now publish itself every Saturday around 6–7 PM ' +
    'and email the PDF link to the Notify Email address.');
}

function disableAutoPublish(quiet) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === BULLETIN.autoPublishHandler) ScriptApp.deleteTrigger(t);
  });
  if (quiet !== true) SpreadsheetApp.getUi().alert('Auto-publish is off.');
}

function autoPublishBulletin() {
  var r = publish_(true);
  var to = readSettings_()['Notify Email'];
  if (to) {
    MailApp.sendEmail(to, 'Bulletin published for ' + r.snap.dateLabel,
      'The bulletin was published automatically.\n\n' +
      'Electronic: ' + r.web + '\nPrintable Doc: ' + r.doc + '\nPDF: ' + r.pdf + '\n\n' +
      r.snap.announcements.length + ' announcement(s) included.');
  }
}

/* ------------------------------------------------------------- web API */
/*
 * The pages live on GitHub Pages (docs/ folder) so Google's "created by a Google Apps
 * Script user" banner never appears. This script only answers JSON:
 *   GET  ?api=bulletin[&preview=1]   published bulletin (or live sheet data for preview)
 *   GET  ?api=submitInfo             ward name, deadline, next Sunday for the form
 *   POST {action:'submit', form}     new announcement (lands as Pending)
 *   POST {action:'adminList'|'adminUpdate'|'adminPublish', key, ...}   admin page
 * POST bodies are sent as text/plain so browsers skip the CORS preflight Apps Script can't answer.
 */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (!p.api) return movedPage_(p);
  return json_(function () {
    var ss = ss_();
    ensureSetup_(ss);
    var settings = readSettings_(ss);
    if (p.api === 'bulletin') {
      var snap = (p.preview ? null : loadPublished_(ss)) || buildSnapshot_(ss, settings);
      snap.isPreview = !!p.preview;
      delete snap.doc; // the editable Doc link is for the admin page only
      return snap;
    }
    if (p.api === 'submitInfo') {
      return {
        ward: settings['Ward Name'] || '',
        deadline: settings['Submission Deadline'] || '',
        nextSunday: nextSundayYmd(todayYmd_(ss)),
      };
    }
    throw new Error('Unknown request.');
  });
}

function doPost(e) {
  return json_(function () {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (b.action === 'submit') return submitAnnouncement(b.form);
    if (b.action === 'adminList') return adminList(b.key);
    if (b.action === 'adminUpdate') return adminUpdate(b.key, b.id, b.changes);
    if (b.action === 'adminPublish') return adminPublish(b.key);
    throw new Error('Unknown request.');
  });
}

function json_(fn) {
  var out;
  try {
    out = { ok: true, data: fn() };
  } catch (err) {
    console.warn(err);
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Anyone opening the old script.google.com link gets pointed at the new site. */
function movedPage_(p) {
  var settings = readSettings_();
  // Old emailed admin links (…/exec?page=admin&key=…) still work: they point to the new admin page.
  var site = p.page === 'admin' && isAdmin_(p.key) ? adminUrl_(settings) : siteUrl_(settings);
  return HtmlService.createHtmlOutput('<p style="font:18px/1.5 sans-serif;padding:24px">' +
    'The ward bulletin has moved: <a target="_top" href="' + esc_(site) + '">' + esc_(site) + '</a></p>')
    .setTitle('Ward bulletin').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** POST {action:'submit'} from the submission form. */
function submitAnnouncement(f) {
  f = f || {};
  if (f.website) return { ok: true }; // honeypot field: bots fill it, people never see it

  function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function date(v) { v = text(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }

  var a = {
    title: text(f.title, 120),
    details: text(f.details, 1500),
    eventDate: date(f.eventDate),
    runFrom: date(f.runFrom),
    runThrough: date(f.runThrough),
    contact: text(f.publicContact, 120),
    name: text(f.name, 100),
    reach: text(f.reach, 120),
  };
  if (!a.title || !a.details || !a.name || !a.reach) {
    throw new Error('Please fill in the title, details, your name, and how to reach you.');
  }
  if (a.runFrom && a.runThrough && a.runThrough < a.runFrom) {
    throw new Error('"Stop running after" must be on or after "Start running".');
  }
  a.runThrough = defaultRunThrough(a.runFrom, a.runThrough, a.eventDate, nextSundayYmd(todayYmd_(ss_())));

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = ss_();
    var sh = ss.getSheetByName(BULLETIN.announcementsSheet);
    if (!sh) throw new Error('The bulletin is not set up yet. Please contact the bulletin coordinator.');
    var col = headerIndex_(sh);
    var row = new Array(sh.getLastColumn()).fill('');
    function put(h, v) { if (h in col) row[col[h]] = v; }
    put('Submitted', new Date());
    put('Status', 'Pending');
    put('Title', noFormula_(a.title));
    put('Details', noFormula_(a.details));
    put('Event Date', a.eventDate);
    put('Run From', a.runFrom);
    put('Run Through', a.runThrough);
    put('Public Contact', noFormula_(a.contact));
    put('Submitted By', noFormula_(a.name));
    put('Submitter Contact', noFormula_(a.reach));
    put('ID', newId_());
    sh.appendRow(row);
  } finally {
    lock.releaseLock();
  }

  var settings = readSettings_();
  var to = settings['Notify Email'];
  if (to) {
    try {
      MailApp.sendEmail(to, 'Bulletin submission: ' + a.title,
        a.name + ' (' + a.reach + ') submitted an announcement:\n\n' + a.title + '\n\n' + a.details +
        '\n\nApprove or reject it here:\n' + (adminUrl_(settings) || ss_().getUrl()) +
        '\n\n(This admin link is private. Please do not forward it.)');
    } catch (err) {
      console.warn('Notification email failed: ' + err);
    }
  }
  return { ok: true };
}

/* ---------------------------------------------------------- data access */

function ss_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { /* web app context */ }
  if (ss) return ss;
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Run Bulletin > Setup > Create / repair bulletin tabs once from the spreadsheet.');
  return SpreadsheetApp.openById(id);
}

function buildSnapshot_(ss, settings) {
  var tz = ss.getSpreadsheetTimeZone();
  var cw = ss.getSheetByName(BULLETIN.currentWeekSheet);
  if (!cw) throw new Error('Could not find the "' + BULLETIN.currentWeekSheet + '" tab.');

  var rows = cw.getRange(1, 1, Math.max(cw.getLastRow(), 1), 2).getDisplayValues();
  var sunday = currentSunday_(ss);

  return {
    ward: String(settings['Ward Name'] || ''),
    stake: String(settings['Stake Name'] || ''),
    meetingTime: String(settings['Meeting Time'] || ''),
    classesTime: String(settings['Classes Time'] || ''),
    wardWebsite: String(settings['Ward Website'] || ''),
    location: String(settings['Location'] || ''),
    footer: String(settings['Footer'] || ''),
    deadline: String(settings['Submission Deadline'] || ''),
    sundayYmd: sunday,
    dateLabel: formatYmd(sunday, 'full'),
    agenda: buildAgenda(rows, { presiding: settings['Presiding'], hymnTitles: readHymnTitles_(ss) }),
    announcements: selectAnnouncements(readAnnouncements_(ss, tz), sunday),
    publishedAt: Utilities.formatDate(new Date(), tz, "EEE MMM d 'at' h:mm a"),
  };
}

function readAnnouncements_(ss, tz) {
  var sh = ss.getSheetByName(BULLETIN.announcementsSheet);
  if (!sh || sh.getLastRow() < 2) return [];
  var col = headerIndex_(sh);
  return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().map(function (r) {
    return rowToAnnouncement_(r, col, tz);
  });
}

function rowToAnnouncement_(r, col, tz) {
  function get(h) { return h in col ? r[col[h]] : ''; }
  var submitted = get('Submitted');
  var order = get('Order');
  return {
    id: String(get('ID')),
    status: String(get('Status')).trim(),
    order: order === '' || isNaN(Number(order)) ? '' : Number(order),
    title: String(get('Title')),
    details: String(get('Details')),
    eventDate: toYmd_(get('Event Date'), tz),
    runFrom: toYmd_(get('Run From'), tz),
    runThrough: toYmd_(get('Run Through'), tz),
    contact: String(get('Public Contact')),
    submittedBy: String(get('Submitted By')),
    reach: String(get('Submitter Contact')),
    notes: String(get('Manager Notes')),
    submitted: submitted instanceof Date ? Utilities.formatDate(submitted, tz, 'EEE MMM d, h:mm a') : String(submitted),
    submittedMs: submitted instanceof Date ? submitted.getTime() : 0,
  };
}

/** The Sunday the bulletin is for: the date in Current Week!D1, else the coming Sunday. */
function currentSunday_(ss) {
  var cw = ss.getSheetByName(BULLETIN.currentWeekSheet);
  var d = cw ? toYmd_(cw.getRange('D1').getValue(), ss.getSpreadsheetTimeZone()) : '';
  return d || nextSundayYmd(todayYmd_(ss));
}

/* ---------------------------------------------------------- admin page */

function adminKey_(reset) {
  var props = PropertiesService.getScriptProperties();
  var k = props.getProperty('ADMIN_KEY');
  if (!k || reset) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('ADMIN_KEY', k);
  }
  return k;
}

function isAdmin_(key) {
  var k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!k && typeof key === 'string' && key === k;
}

/** Every admin action calls this first: google.script.run can reach any server function. */
function requireAdmin_(key) {
  if (!isAdmin_(key)) {
    throw new Error('This admin link is no longer valid. In the spreadsheet, choose Bulletin → Admin page for the current link.');
  }
}

function adminUrl_(settings) {
  // The key goes after '#', which browsers never send to a server or in a Referer header.
  var base = siteUrl_(settings);
  return base ? base + 'admin.html#key=' + adminKey_() : '';
}

function showAdminLink() {
  var url = adminUrl_(readSettings_());
  if (!url) {
    return SpreadsheetApp.getUi().alert('Fill in "Site URL" on the ' + BULLETIN.settingsSheet + ' tab first.');
  }
  showDialog_('Admin page (keep this link private)', [
    ['Approve, edit, and publish announcements. Bookmark it on your phone. Anyone with this link can approve announcements.', url],
  ]);
}

function resetAdminLink() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Reset admin link?', 'The old admin link will stop working right away.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  adminKey_(true);
  showAdminLink();
}

function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

/** Adds the ID column if missing and gives every announcement row an ID. Returns the header index. */
function ensureIds_(sh) {
  var col = headerIndex_(sh);
  if (!('ID' in col)) {
    sh.getRange(1, sh.getLastColumn() + 1).setValue('ID').setFontWeight('bold');
    col = headerIndex_(sh);
  }
  var n = sh.getLastRow() - 1;
  if (n < 1) return col;
  var range = sh.getRange(2, col['ID'] + 1, n, 1);
  var ids = range.getValues();
  var changed = false;
  ids.forEach(function (r) { if (!String(r[0]).trim()) { r[0] = newId_(); changed = true; } });
  if (changed) range.setValues(ids);
  return col;
}

function announcementsSheet_(ss) {
  var sh = ss.getSheetByName(BULLETIN.announcementsSheet);
  if (!sh) throw new Error('Run Bulletin > Setup > Create / repair bulletin tabs first.');
  return sh;
}

function adminList(key) {
  requireAdmin_(key);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = ss_();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = announcementsSheet_(ss);
    var col = ensureIds_(sh);
    var sunday = currentSunday_(ss);
    var items = [];
    if (sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues().forEach(function (r) {
        var a = rowToAnnouncement_(r, col, tz);
        if (!a.title.trim() && !a.details.trim()) return;
        a.live = isAnnouncementActive(a, sunday);
        items.push(a);
      });
    }
    var published = loadPublished_(ss);
    return {
      ward: readSettings_(ss)['Ward Name'] || '',
      sunday: sunday,
      sundayLabel: formatYmd(sunday, 'full'),
      publishedAt: published ? published.publishedAt + ' (for ' + published.dateLabel + ')' : '',
      pdf: published && published.pdf || '',
      doc: published && published.doc || '',
      items: items,
    };
  } finally {
    lock.releaseLock();
  }
}

function adminUpdate(key, id, changes) {
  requireAdmin_(key);
  changes = changes || {};
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = ss_();
    var tz = ss.getSpreadsheetTimeZone();
    var sh = announcementsSheet_(ss);
    var col = ensureIds_(sh);
    var ids = sh.getRange(2, col['ID'] + 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    var row = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(id)) { row = i + 2; break; }
    }
    if (row < 0) throw new Error('That announcement was not found. It may have been deleted from the sheet.');

    Object.keys(changes).forEach(function (field) {
      var spec = ADMIN_FIELDS[field];
      if (!spec || !(spec[0] in col)) return;
      sh.getRange(row, col[spec[0]] + 1).setValue(cleanAdminValue_(field, changes[field], spec[1]));
    });

    var a = rowToAnnouncement_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], col, tz);
    a.live = isAnnouncementActive(a, currentSunday_(ss));
    return a;
  } finally {
    lock.releaseLock();
  }
}

function cleanAdminValue_(field, v, max) {
  v = String(v == null ? '' : v).trim();
  if (field === 'status') {
    if (ANNOUNCEMENT_STATUSES.indexOf(v) === -1) throw new Error('Unknown status: ' + v);
    return v;
  }
  if (field === 'order') {
    if (v === '') return '';
    if (!/^\d{1,3}$/.test(v)) throw new Error('Order must be a whole number (1, 2, 3…) or blank.');
    return Number(v);
  }
  if (/date|run/i.test(field)) {
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Dates must look like 2026-10-11.');
    return v;
  }
  if (field === 'title' && !v) throw new Error('The title cannot be empty.');
  return noFormula_(v.slice(0, max || 500));
}

function adminPublish(key) {
  requireAdmin_(key);
  var r = publish_(true);
  return { dateLabel: r.snap.dateLabel, count: r.snap.announcements.length, web: r.web, doc: r.doc, pdf: r.pdf,
    publishedAt: r.snap.publishedAt };
}

function readHymnTitles_(ss) {
  var sh = ss.getSheetByName(BULLETIN.hymnsSheet);
  var map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    if (r[0]) map[String(r[0]).trim()] = String(r[1]).trim();
  });
  return map;
}

function readSettings_(ss) {
  var sh = (ss || ss_()).getSheetByName(BULLETIN.settingsSheet);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  // Display values, so "10:00 AM" stays "10:00 AM" even though Sheets stores it as a time.
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    var k = String(r[0]).trim();
    if (k) out[k] = String(r[1]).trim();
  });
  return out;
}

function savePublished_(ss, snap) {
  var sh = ss.getSheetByName(BULLETIN.publishedSheet) || ss.insertSheet(BULLETIN.publishedSheet);
  sh.getRange('A1').setValue(JSON.stringify(snap));
  if (!sh.isSheetHidden()) sh.hideSheet();
}

function loadPublished_(ss) {
  var sh = ss.getSheetByName(BULLETIN.publishedSheet);
  if (!sh) return null;
  var raw = sh.getRange('A1').getValue();
  try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function headerIndex_(sh) {
  var map = {};
  sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].forEach(function (h, i) {
    if (String(h).trim()) map[String(h).trim()] = i;
  });
  return map;
}

/* --------------------------------------------------------------- helpers */

/** The bulletin website, always ending in '/'. */
function siteUrl_(settings) {
  var url = String((settings && settings['Site URL']) || '').trim();
  return url && url.slice(-1) !== '/' ? url + '/' : url;
}

function toYmd_(v, tz) {
  if (v instanceof Date && !isNaN(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s.replace(/^[A-Za-z]+,\s*(?=[A-Za-z])/, '')); // drop a leading weekday
  return isNaN(d) ? '' : Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function todayYmd_(ss) {
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/** Stops submitted text like "=IMPORTXML(...)" from being run as a formula. */
function noFormula_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function showDialog_(title, links) {
  var html = '<div style="font:14px/1.5 Arial,sans-serif">' + links.filter(function (l) { return l[1]; })
    .map(function (l) {
      return '<p style="margin:0 0 12px"><b>' + esc_(l[0]) + '</b><br><a target="_blank" href="' +
        esc_(l[1]) + '">' + esc_(l[1]) + '</a></p>';
    }).join('') + '</div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(560).setHeight(80 + links.length * 70), title);
}
