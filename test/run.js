// Runs Model.gs outside Apps Script and renders local previews of the web pages.
// Usage: node test/run.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const root = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
for (const f of ['HymnLinks.gs', 'Model.gs']) {
  vm.runInContext(fs.readFileSync(path.join(root, 'apps-script', f), 'utf8'), ctx);
}
const { buildAgenda, selectAnnouncements, parseHymn, formatYmd, nextSundayYmd, scheduleLine, defaultRunThrough,
  wardFeedEvents, eventAnnouncementDetails, clockTime } = ctx;

// "Current Week" tab as it looked on 2026-10-07 (a Fast Sunday).
const fastRows = [
  ['Speaker Assignment', 'Brother NA'], ['Topic', 'Testimony Meeting'], ['Conducting', 'Bishop Thompson'],
  ['Chorister', 'Kendra Stenberg'], ['Organist', 'Savanah Olmstead'], ['', ''],
  ['Opening Hymn', '286. Oh, What Songs of the Heart'], ['Invocation', 'Kenneth Martin '],
  ['Sacrament Hymn', '185. Reverently and Meekly Now'], ['Youth Speaker', 'FAST SUNDAY (Week 2)'],
  ['', ''], ['', ''], ['', ''],
  ['Closing Hymn', '1037. I’m Gonna Live So God Can Use Me'], ['Benediction', 'Amber Stonehocker '],
];

// A guess at a regular week: speakers plus an intermediate musical number.
const regularRows = [
  ['Speaker Assignment', 'Brother Lilly'], ['Topic', 'Gratitude'], ['Conducting', 'Brother Lilly'],
  ['Chorister', 'Kendra Stenberg'], ['Organist', 'Savanah Olmstead'], ['', ''],
  ['Opening Hymn', '2. The Spirit of God'], ['Invocation', 'Bo Ingram'],
  ['Sacrament Hymn', '169'], ['Youth Speaker', 'Jacob Valdez'], ['Speaker 1', 'Jonathan Durrant'],
  ['Int.Hymn / Musical Number', 'Primary children — “I Am a Child of God”'], ['Speaker 2', 'Heidi Baker'],
  ['Speaker 3', 'N/A'], ['Closing Hymn', '1025. Take My Heart and Let It Be Consecrated'], ['Benediction', 'Skylar Peterson'],
];

const kinds = (a) => a.items.map((i) => (i.type === 'section' ? '§' + i.text : i.label)).join(' | ');

const fast = buildAgenda(fastRows, { presiding: 'Bishop Thompson' });
assert.strictEqual(fast.isFastSunday, true);
assert.strictEqual(fast.header.map((h) => h.label).join(), 'Presiding,Conducting,Chorister,Organist');
assert.strictEqual(kinds(fast), 'Opening Hymn | Invocation | §Ward & Stake Business | Sacrament Hymn | ' +
  '§Administration of the Sacrament | §Bearing of Testimonies | Closing Hymn | Benediction');
assert.strictEqual(fast.items[0].number, '286');
assert.strictEqual(fast.items[1].value, 'Kenneth Martin');
assert.strictEqual(fast.items[0].url,
  'https://www.churchofjesuschrist.org/study/manual/hymns/oh-what-songs-of-the-heart?lang=eng');
assert.strictEqual(fast.items.find((i) => i.label === 'Closing Hymn').url,
  'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/im-gonna-live-so-god-can-use-me?lang=eng');

// Empty or N/A prayers default to "By Invitation"; other empty rows are still dropped.
const prayers = buildAgenda([['Invocation', ''], ['Opening Hymn', '2. The Spirit of God'], ['Benediction', 'N/A'], ['Speaker 2', '']]);
assert.strictEqual(prayers.items.filter((i) => i.type === 'person').map((i) => i.label + ': ' + i.value).join(' | '),
  'Invocation: By Invitation | Benediction: By Invitation');

const reg = buildAgenda(regularRows, { hymnTitles: { 169: 'As Now We Take the Sacrament' } });
assert.strictEqual(reg.isFastSunday, false);
assert.strictEqual(kinds(reg), 'Opening Hymn | Invocation | §Ward & Stake Business | Sacrament Hymn | ' +
  '§Administration of the Sacrament | Youth Speaker | Speaker | Musical Number | Speaker | Closing Hymn | Benediction');
assert.strictEqual(reg.items[3].title, 'As Now We Take the Sacrament');

const conf = buildAgenda([['Topic', 'Stake Conference'], ['Opening Hymn', 'N/A']]);
assert.deepStrictEqual(JSON.parse(JSON.stringify(conf.items)), [{ type: 'section', text: 'Stake Conference' }]);

assert.deepStrictEqual(JSON.parse(JSON.stringify(parseHymn('117 "Come unto Jesus"'))), { number: '117', title: 'Come unto Jesus' });
assert.strictEqual(parseHymn('Primary children'), null);
assert.strictEqual(formatYmd('2026-10-11', 'full'), 'Sunday, October 11, 2026');
assert.strictEqual(nextSundayYmd('2026-10-07'), '2026-10-11');
assert.strictEqual(nextSundayYmd('2026-10-11'), '2026-10-11');

const ann = [
  { status: 'Approved', order: '', title: 'Trunk-or-Treat', details: 'Bring a car and candy!\nChili cook-off too.',
    eventDate: '2026-10-30', runFrom: '2026-10-11', runThrough: '', contact: 'Sister Jones, 555-0123' },
  { status: 'Approved', order: 1, title: 'Temple Night', details: 'Ward temple night. Sign up: https://example.org/signup.',
    eventDate: '2026-10-22', runFrom: '', runThrough: '', contact: '' },
  { status: 'Pending', order: '', title: 'Not yet approved', details: 'x', eventDate: '', runFrom: '', runThrough: '' },
  { status: 'Approved', order: '', title: 'Starts later', details: 'x', eventDate: '', runFrom: '2026-10-18', runThrough: '' },
  { status: 'Approved', order: '', title: 'Already happened', details: 'x', eventDate: '2026-10-10', runFrom: '', runThrough: '' },
  { status: 'approved', order: '', title: 'Ended', details: 'x', eventDate: '', runFrom: '2026-09-01', runThrough: '2026-10-04' },
  { status: 'Approved', order: '', title: 'Youth Service Project', details: 'Meet at the church at 9 AM Saturday to help clean up the park.',
    eventDate: '2026-10-17', runFrom: '', runThrough: '', contact: 'Brother Earl' },
];
const picked = selectAnnouncements(ann, '2026-10-11');
assert.strictEqual(picked.map((a) => a.title).join(' | '), 'Youth Service Project | Temple Night | Trunk-or-Treat'); // by event date
const undated = selectAnnouncements([
  { status: 'Approved', title: 'Temple schedule', details: 'x', order: 2 },
  { status: 'Approved', title: 'Ward contacts', details: 'x', order: 1 },
  { status: 'Approved', title: 'Fall festival', details: 'x', eventDate: '2026-10-24' },
], '2026-10-11');
assert.strictEqual(undated.map((a) => a.title).join(' | '), 'Fall festival | Ward contacts | Temple schedule'); // undated last, by Order
assert.strictEqual(picked[2].when, 'Friday, October 30'); // Trunk-or-Treat is still last
assert.strictEqual(selectAnnouncements(ann, '2026-10-31').map((a) => a.title).join(), 'Starts later'); // no end date: runs until archived

assert.strictEqual(scheduleLine('10:00 AM', '11:15 AM'), 'Classes 10:00 AM  ·  Sacrament Meeting 11:15 AM');
assert.strictEqual(scheduleLine('', '11:15 AM'), 'Sacrament Meeting 11:15 AM');

// New submissions: an explicit stop date or an event date wins; otherwise one Sunday only.
assert.strictEqual(defaultRunThrough('2026-10-11', '2026-10-25', '', '2026-10-11'), '2026-10-25');
assert.strictEqual(defaultRunThrough('2026-10-11', '', '2026-10-30', '2026-10-11'), '');
assert.strictEqual(defaultRunThrough('2026-10-18', '', '', '2026-10-11'), '2026-10-18');
assert.strictEqual(defaultRunThrough('2026-10-14', '', '', '2026-10-11'), '2026-10-18'); // midweek start
assert.strictEqual(defaultRunThrough('', '', '', '2026-10-11'), '2026-10-11');
const oneOff = { status: 'Approved', title: 'x', details: 'x', runFrom: '2026-10-11', runThrough: '2026-10-11', eventDate: '' };
assert.strictEqual(selectAnnouncements([oneOff], '2026-10-11').length, 1);
assert.strictEqual(selectAnnouncements([oneOff], '2026-10-18').length, 0);

// Ward website feed (same shape as the real one; made-up content).
const feed = { response: { docs: [{
  c_linkedEvents: [
    { id: 'chq-event-1', name: 'Ward Temple Night', c_eventStatus: 'SCHEDULED', time: { start: '2026-10-16T19:00', end: '2026-10-16T20:00' },
      c_audienceCategory: ['EVERYONE'], address: { line1: '1050 West Grove Parkway', city: 'Tempe' }, description: 'Meet at the temple.' },
    { id: 'chq-event-2', name: 'Last Year Potluck', c_eventStatus: 'SCHEDULED', time: { start: '2025-02-09T11:15' } },
    { id: 'chq-draft-3', name: 'Draft', c_eventStatus: null, time: { start: '2026-12-01T10:00' } },
  ],
  c_unitParent: [{ c_linkedEvents: [
    { id: 'chq-event-4', name: 'Halloween Dance Party', c_eventStatus: 'SCHEDULED', time: { start: '2026-10-28T19:00', end: '2026-10-28T20:30' },
      c_audienceCategory: ['GIRLS_(11+)', 'BOYS_(11+)'], description: 'Costume contest (no masks).' },
    { id: 'chq-event-5', name: 'Halloween Dance Party', c_eventStatus: 'SCHEDULED', time: { start: '2026-10-28T19:00' } },
    { id: 'chq-event-6', name: 'Stake Center Closed', c_eventStatus: 'SCHEDULED', c_isAllDayEvent: true, time: { start: '2026-10-08T08:00' } },
  ] }],
}] } };
const evs = wardFeedEvents(feed, '2026-10-08');
assert.strictEqual(evs.map((e) => e.source + ':' + e.name).join(' | '),
  'Stake:Stake Center Closed | Ward:Ward Temple Night | Stake:Halloween Dance Party'); // past, drafts, duplicates dropped
assert.strictEqual(evs[2].audience, 'Youth girls, Youth boys');
assert.strictEqual(clockTime('2026-10-28T19:00'), '7:00 PM');
assert.strictEqual(clockTime('2026-10-28T00:30'), '12:30 AM');
assert.strictEqual(eventAnnouncementDetails(evs[1]).split(String.fromCharCode(10)).join(' / '),
  'Time: 7:00 PM – 8:00 PM / Where: 1050 West Grove Parkway, Tempe /  / Meet at the temple.');
assert.strictEqual(eventAnnouncementDetails(evs[0]), 'Time: All day');
assert.throws(() => wardFeedEvents({}, '2026-10-08'), /no unit data/);
if (process.env.WARD_FEED) { // optional smoke test against a saved copy of the real feed
  const real = wardFeedEvents(JSON.parse(fs.readFileSync(process.env.WARD_FEED, 'utf8')), '2026-10-08');
  console.log('real feed: ' + real.length + ' upcoming');
  real.forEach((e) => console.log('  ' + e.start + ' ' + e.source + ': ' + e.name + ' [' + e.audience + ']'));
}

console.log('All model tests passed.');

// ---- previews: render the Apps Script templates with sample data
const snap = {
  ward: 'Ahwatukee Groves Ward', stake: 'Tempe Arizona West Stake', meetingTime: '11:15 AM', classesTime: '10:00 AM', location: '', footer: '',
  deadline: 'Thursday at 5:00 PM', sundayYmd: '2026-10-11', dateLabel: formatYmd('2026-10-11', 'full'),
  agenda: fast, announcements: picked, publishedAt: 'Sat Oct 10 at 6:02 PM', submitUrl: 'submit.html',
};
const out = path.join(root, 'preview');
fs.mkdirSync(out, { recursive: true });
// Each preview is a real docs/ page with window.MOCK_API standing in for the Apps Script backend.
const adminItems = ann.map((a, i) => ({ id: 'id' + i, notes: '', submittedBy: 'Sister Example', reach: 'example@mail.com',
  submitted: 'Tue Oct ' + (1 + i) + ', 3:1' + i + ' PM', submittedMs: i, ...a, order: a.order === '' ? '' : a.order,
  live: ctx.isAnnouncementActive(a, '2026-10-11') }));
adminItems[2].title = 'Primary Halloween Party'; adminItems[2].details = 'Costumes welcome! Friday 6 PM in the cultural hall.';

function mockServer(bulletin, items, wardEvents) {
  const later = (v, ms) => new Promise((res) => setTimeout(() => res(JSON.parse(JSON.stringify(v))), ms));
  const isActive = (a, s) => a.status === 'Approved' && !(a.runFrom && s < a.runFrom) &&
    !((a.runThrough || a.eventDate) && s > (a.runThrough || a.eventDate)) && !(a.eventDate && a.eventDate < s);
  window.MOCK_API = (method, req) => {
    if (method === 'GET' && req.api === 'bulletin') return later(bulletin, 300);
    if (method === 'GET' && req.api === 'submitInfo') {
      return later({ ward: bulletin.ward, deadline: bulletin.deadline, nextSunday: '2026-10-11' }, 200);
    }
    if (req.action === 'submit') { console.log('submitted', req.form); return later({ ok: true }, 400); }
    if (req.action === 'adminList') {
      return later({ ward: bulletin.ward, sunday: '2026-10-11', sundayLabel: 'Sunday, October 11, 2026',
        publishedAt: 'Sat Oct 10 at 6:02 PM (for Sunday, October 11, 2026)', pdf: '#pdf', doc: '#doc', items }, 200);
    }
    if (req.action === 'adminUpdate') {
      const a = items.find((x) => x.id === req.id);
      Object.assign(a, req.changes);
      if (req.changes.order !== undefined) a.order = req.changes.order === '' ? '' : Number(req.changes.order);
      a.live = isActive(a, '2026-10-11');
      return later(a, 250);
    }
    if (req.action === 'adminWardEvents') return later({ events: wardEvents }, 600);
    if (req.action === 'adminImportEvent') {
      const e = wardEvents.find((x) => x.id === req.id);
      e.added = true;
      const a = { id: 'new' + req.id, status: 'Pending', order: '', title: e.name, details: e.details, eventDate: e.start.slice(0, 10),
        runFrom: '2026-10-11', runThrough: '', contact: '', submittedBy: e.source + ' website', reach: '', notes: 'From ' + e.url,
        submitted: 'Thu Oct 8, 1:00 AM', submittedMs: 99, live: false };
      items.push(a);
      return later(a, 400);
    }
    if (req.action === 'adminPublish') {
      return later({ dateLabel: 'Sunday, October 11, 2026', count: items.filter((a) => a.live).length,
        web: './', doc: '#doc', pdf: '#pdf', publishedAt: 'Wed Oct 7 at 11:40 PM' }, 800);
    }
    return Promise.reject(new Error('Unknown request.'));
  };
}

const page = (file, bulletin) => fs.readFileSync(path.join(root, 'docs', file), 'utf8').replace(
  '<script src="api.js"></script>',
  '<script>(' + mockServer + ')(' + JSON.stringify(bulletin).split('<').join(String.fromCharCode(92) + 'u003c') + ',' +
    JSON.stringify(adminItems) + ',' + JSON.stringify(evs.map((e) => ({ ...e, details: eventAnnouncementDetails(e), url: '#' })))
    + ')</script><script src="api.js"></script>');
fs.copyFileSync(path.join(root, 'docs', 'api.js'), path.join(out, 'api.js'));
fs.writeFileSync(path.join(out, 'index.html'), page('index.html', { ...snap, pdfDownload: '#pdf' }));
fs.writeFileSync(path.join(out, 'regular.html'), page('index.html', { ...snap, agenda: reg }));
fs.writeFileSync(path.join(out, 'submit.html'), page('submit.html', snap));
fs.writeFileSync(path.join(out, 'admin.html'), page('admin.html', snap));
console.log('Previews written to ' + out + ' (open admin.html#key=test)');
