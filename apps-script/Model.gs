/**
 * Model.gs — pure bulletin logic. No Google services are used here, so this
 * file can be unit-tested outside Apps Script (see test/run.js).
 * Dates are always plain 'yyyy-MM-dd' strings to avoid time-zone surprises.
 */

var BULLETIN_HEADER_LABELS = ['presiding', 'conducting', 'chorister', 'music director',
  'organist', 'accompanist', 'pianist', 'prelude', 'prelude musician'];
var BULLETIN_SKIP_LABELS = ['speaker assignment', 'topic', 'theme'];
var BULLETIN_BLANK_VALUES = ['', 'n/a', 'na', 'none', '-', '--'];

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normLabel(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[.:#]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanValue(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
}

function isBlankValue(v) {
  return BULLETIN_BLANK_VALUES.indexOf(cleanValue(v).toLowerCase()) !== -1;
}

/** "286. Oh, What Songs of the Heart" -> {number:'286', title:'Oh, What Songs of the Heart'} */
function parseHymn(v, hymnTitles) {
  var m = cleanValue(v).match(/^#?\s*(\d{1,4})\s*[.:)\-–—]?\s*(.*)$/);
  if (!m) return null;
  var title = m[2].replace(/^["“']+|["”']+$/g, '').trim();
  if (!title && hymnTitles) title = hymnTitles[m[1]] || '';
  return { number: m[1], title: title };
}

/** Gospel Library link for a hymn number (opens in the app on phones), or '' if unknown. */
function hymnUrl(number) {
  var links = typeof HYMN_LINKS === 'undefined' ? {} : HYMN_LINKS;
  var p = links[String(number).replace(/^0+/, '')];
  if (!p) return '';
  var book = p.charAt(0) === 'h' ? 'music/hymns-for-home-and-church/' : 'manual/hymns/';
  return 'https://www.churchofjesuschrist.org/study/' + book + p.slice(2) + '?lang=eng';
}

function hymnLabel_(L) {
  if (/sac/.test(L)) return 'Sacrament Hymn';
  if (/clos/.test(L)) return 'Closing Hymn';
  if (/^op|open/.test(L)) return 'Opening Hymn';
  if (/int|rest|music/.test(L)) return 'Intermediate Hymn';
  return null;
}

function isIntermediate_(L) {
  return /int|rest|music/.test(L) && !/sac|clos|^op|open/.test(L);
}

function speakerLabel_(L) {
  if (/youth/.test(L)) return 'Youth Speaker';
  if (/primary/.test(L)) return 'Primary Speaker';
  return 'Speaker';
}

/**
 * Turns the label/value rows of the "Current Week" tab into a bulletin agenda.
 * rows: [[label, value], ...] in the order they appear on the sheet.
 * Returns {header:[{label,value}], topic, isFastSunday, items:[...]} where each item is
 *   {type:'hymn', label, number, title} | {type:'person', label, value} |
 *   {type:'music', label, value}        | {type:'section', text}
 */
function buildAgenda(rows, opts) {
  opts = opts || {};
  var header = [];
  var items = [];
  var topic = '';
  var label, L, value, i;

  for (i = 0; i < rows.length; i++) {
    if (normLabel(rows[i][0]) === 'topic') topic = cleanValue(rows[i][1]);
  }
  var isFast = /testimon/i.test(topic) || rows.some(function (r) {
    return /fast sunday/i.test(cleanValue(r[1]));
  });

  if (opts.presiding) header.push({ label: 'Presiding', value: cleanValue(opts.presiding) });

  var testimoniesAdded = false;
  function addTestimonies() {
    if (!testimoniesAdded) items.push({ type: 'section', text: 'Bearing of Testimonies' });
    testimoniesAdded = true;
  }

  for (i = 0; i < rows.length; i++) {
    label = cleanValue(rows[i][0]);
    L = normLabel(label);
    value = cleanValue(rows[i][1]);
    if (!L || BULLETIN_SKIP_LABELS.indexOf(L) !== -1) continue;

    if (BULLETIN_HEADER_LABELS.indexOf(L) !== -1) {
      if (!isBlankValue(value) && !(L === 'presiding' && opts.presiding)) {
        header.push({ label: /prelude/.test(L) ? 'Prelude' : label, value: value });
      }
      continue;
    }

    if (/speaker|adult|talk|testimon/.test(L)) {
      if (isFast) { addTestimonies(); continue; }
      if (isBlankValue(value)) continue;
      items.push({ type: 'person', label: speakerLabel_(L), value: value });
      continue;
    }

    if (/hymn|music/.test(L)) {
      if (isBlankValue(value)) continue;
      if (isFast && isIntermediate_(L)) continue;
      var h = parseHymn(value, opts.hymnTitles);
      if (h) {
        items.push({ type: 'hymn', label: hymnLabel_(L) || label, number: h.number, title: h.title,
          url: hymnUrl(h.number) });
      } else {
        items.push({ type: 'music', label: isIntermediate_(L) ? 'Musical Number' : label, value: value });
      }
      if (/sac/.test(L)) items.push({ type: 'section', text: 'Administration of the Sacrament' });
      continue;
    }

    var isPrayer = /invocation|benediction|prayer/.test(L);
    if (isBlankValue(value)) {
      if (!isPrayer) continue;
      value = 'By Invitation';
    }
    items.push({ type: 'person', label: label, value: value });
    if (/invocation|opening prayer/.test(L)) {
      items.push({ type: 'section', text: 'Ward & Stake Business' });
    }
  }

  // Fast Sunday with no speaker rows on the sheet: testimonies go before the closing hymn.
  if (isFast && !testimoniesAdded) {
    var at = items.length;
    for (i = 0; i < items.length; i++) {
      if (items[i].label === 'Closing Hymn') { at = i; break; }
    }
    items.splice(at, 0, { type: 'section', text: 'Bearing of Testimonies' });
  }

  // Nothing scheduled (e.g. Stake or General Conference): show the topic as a notice.
  var hasProgram = items.some(function (it) { return it.type !== 'section'; });
  if (!hasProgram && topic) items = [{ type: 'section', text: topic }];

  return { header: header, topic: topic, isFastSunday: isFast, items: items };
}

/** True if this announcement belongs in the bulletin for the given Sunday (rules below). */
function isAnnouncementActive(a, sundayYmd) {
  if (cleanValue(a.status).toLowerCase() !== 'approved') return false;
  if (!cleanValue(a.title) && !cleanValue(a.details)) return false;
  var through = a.runThrough || a.eventDate || '';
  if (a.runFrom && sundayYmd < a.runFrom) return false;
  if (through && sundayYmd > through) return false;
  if (a.eventDate && a.eventDate < sundayYmd) return false;
  return true;
}

/**
 * Picks the announcements to show for a given Sunday.
 * Each row: {status, order, title, details, eventDate, runFrom, runThrough, contact}
 * Rules: must be Approved; Run From/Run Through bound the Sundays it appears;
 * a blank Run Through falls back to the Event Date; events already past are hidden.
 */
function selectAnnouncements(rows, sundayYmd) {
  var picked = rows.filter(function (a) { return isAnnouncementActive(a, sundayYmd); });
  picked.sort(function (a, b) {
    var oa = a.order === '' || a.order == null ? Infinity : Number(a.order);
    var ob = b.order === '' || b.order == null ? Infinity : Number(b.order);
    if (oa !== ob) return oa - ob;
    var ea = a.eventDate || '9999', eb = b.eventDate || '9999';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return cleanValue(a.title) < cleanValue(b.title) ? -1 : 1;
  });
  return picked.map(function (a) {
    return {
      title: cleanValue(a.title),
      details: String(a.details == null ? '' : a.details).trim(),
      when: a.eventDate ? formatYmd(a.eventDate, 'long') : '',
      contact: cleanValue(a.contact),
    };
  });
}

function ymdParts_(ymd) {
  var m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** 'long' -> "Saturday, October 17"; 'full' -> "Sunday, October 11, 2026"; 'short' -> "Sat, Oct 17" */
function formatYmd(ymd, style) {
  var p = ymdParts_(ymd);
  if (!p) return String(ymd || '');
  var dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  if (style === 'short') return DAY_NAMES[dow].slice(0, 3) + ', ' + MONTH_NAMES[p[1] - 1].slice(0, 3) + ' ' + p[2];
  var s = DAY_NAMES[dow] + ', ' + MONTH_NAMES[p[1] - 1] + ' ' + p[2];
  return style === 'full' ? s + ', ' + p[0] : s;
}

/** "Classes 10:00 AM  ·  Sacrament Meeting 11:15 AM" (either part may be blank). */
function scheduleLine(classesTime, meetingTime) {
  return [classesTime ? 'Classes ' + cleanValue(classesTime) : '',
    meetingTime ? 'Sacrament Meeting ' + cleanValue(meetingTime) : ''].filter(String).join('  ·  ');
}

/**
 * Stop date to store for a new submission: the one they chose; else none when an event date
 * will end it; else the first Sunday it runs, so one-off notices don't linger. (Clearing the
 * stop date later on the admin page makes an announcement run until archived.)
 */
function defaultRunThrough(runFrom, runThrough, eventDate, comingSunday) {
  if (runThrough || eventDate) return runThrough || '';
  return nextSundayYmd(runFrom || comingSunday);
}

/** The coming Sunday (today if today is Sunday). */
function nextSundayYmd(todayYmd) {
  var p = ymdParts_(todayYmd);
  var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  d.setUTCDate(d.getUTCDate() + (7 - d.getUTCDay()) % 7);
  return d.toISOString().slice(0, 10);
}
