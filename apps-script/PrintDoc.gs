/**
 * PrintDoc.gs — builds the printed bulletin as a Google Doc (US Letter, landscape):
 * agenda in the left column, announcements in the right. A PDF copy is saved
 * next to it. The Doc stays editable, so last-minute fixes can be made by hand.
 */

var PAGE_W = 792;   // 11in in points
var PAGE_H = 612;   // 8.5in
var MARGIN = 36;    // 0.5in
var GUTTER = 36;    // space between the two columns
var INK = '#1f2a37';
var MUTED = '#5f6b7a';

function createPrintBulletin_(snap, settings) {
  var font = String(settings['Print Font'] || 'Georgia');
  var size = Number(settings['Print Font Size']) || 11;
  var folder = folder_(String(settings['Bulletin Folder'] || 'Ward Bulletins'));
  var name = 'Bulletin ' + snap.sundayYmd;

  var doc = reuseOrCreateDoc_(folder, name);
  var body = doc.getBody();
  body.clear();
  body.setPageWidth(PAGE_W).setPageHeight(PAGE_H)
    .setMarginTop(MARGIN).setMarginBottom(MARGIN).setMarginLeft(MARGIN).setMarginRight(MARGIN);

  var S = makeStyler_(font, size);
  S(body.getChild(0).asParagraph(), { size: 1 }); // the paragraph Docs keeps above the table

  var colW = (PAGE_W - 2 * MARGIN) / 2;
  var layout = body.appendTable([['', '']]);
  layout.setBorderWidth(0);
  layout.setColumnWidth(0, colW).setColumnWidth(1, colW);
  var left = layout.getCell(0, 0);
  var right = layout.getCell(0, 1);
  [left, right].forEach(function (c) {
    c.setPaddingTop(0).setPaddingBottom(0).setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
  });
  left.setPaddingLeft(0).setPaddingRight(GUTTER / 2);
  right.setPaddingLeft(GUTTER / 2).setPaddingRight(0);

  writeAgenda_(left, snap, S, colW - GUTTER / 2);
  writeAnnouncements_(right, snap, settings, S);

  S(body.appendParagraph(''), { size: 1 }); // Docs requires a paragraph after a table
  doc.saveAndClose();

  var pdfName = name + '.pdf';
  var old = folder.getFilesByName(pdfName);
  while (old.hasNext()) old.next().setTrashed(true); // replaced by the fresh copy below
  var pdf = folder.createFile(DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(pdfName));
  // The PDF is offered on the public bulletin page, so anyone with the link may view/download it.
  // The editable Doc stays private.
  try {
    pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('Could not share the PDF publicly: ' + e);
  }

  return {
    doc: doc.getUrl(),
    pdf: pdf.getUrl(),
    pdfDownload: 'https://drive.google.com/uc?export=download&id=' + pdf.getId(),
  };
}

function writeAgenda_(cell, snap, S, width) {
  var A = DocumentApp.HorizontalAlignment;
  var a = snap.agenda;
  var title = cell.getChild(0).asParagraph();
  title.setText(snap.ward || 'Sacrament Meeting'); // setText() does not return the paragraph
  S(title,
    { size: 2.2, bold: true, align: A.CENTER, after: 2 });
  if (snap.stake) S(cell.appendParagraph(snap.stake), { size: 0.85, color: MUTED, align: A.CENTER, after: 4 });
  if (snap.ward) S(cell.appendParagraph('Sacrament Meeting'), { size: 1.25, align: A.CENTER, after: 2 });
  S(cell.appendParagraph(snap.dateLabel), { size: 0.95, color: MUTED, align: A.CENTER, after: 1 });
  var times = scheduleLine(snap.classesTime, snap.meetingTime);
  if (times) S(cell.appendParagraph(times), { size: 0.9, color: MUTED, align: A.CENTER, after: 2 });
  if (snap.location) S(cell.appendParagraph(snap.location), { size: 0.9, color: MUTED, align: A.CENTER, after: 2 });
  if (a.topic && !a.isFastSunday) S(cell.appendParagraph(a.topic), { size: 1, italic: true, align: A.CENTER, after: 2 });
  rule_(cell, S);

  var labelW = Math.round(width * 0.36);
  if (a.header.length) {
    pairTable_(cell, a.header.map(function (h) { return [h.label, h.value]; }), S, labelW, width, 0.92);
    rule_(cell, S);
  }

  // Runs of rows become small two-column tables; section lines sit between them.
  var run = [];
  function flush() {
    if (run.length) pairTable_(cell, run, S, labelW, width, 1, true);
    run = [];
  }
  a.items.forEach(function (it) {
    if (it.type === 'section') {
      flush();
      S(cell.appendParagraph(it.text), { italic: true, align: A.CENTER, before: 5, after: 5 });
    } else if (it.type === 'hymn') {
      run.push([it.label, it.number + (it.title ? '  ' + it.title : ''), it.number.length, it.url]);
    } else {
      run.push([it.label, it.value]);
    }
  });
  flush();

  if (snap.footer) {
    rule_(cell, S);
    S(cell.appendParagraph(snap.footer), { size: 0.85, color: MUTED, italic: true, align: A.CENTER });
  }
}

function writeAnnouncements_(cell, snap, settings, S) {
  var A = DocumentApp.HorizontalAlignment;
  var heading = cell.getChild(0).asParagraph();
  heading.setText('Announcements');
  S(heading, { size: 1.6, bold: true, align: A.CENTER, after: 2 });
  rule_(cell, S);

  if (!snap.announcements.length) {
    S(cell.appendParagraph('No announcements this week.'), { italic: true, color: MUTED, align: A.CENTER });
  }
  snap.announcements.forEach(function (n) {
    S(cell.appendParagraph(n.title), { size: 1.05, bold: true, before: 4, after: 1 });
    if (n.when) S(cell.appendParagraph(n.when), { size: 0.9, italic: true, color: MUTED, after: 1 });
    if (n.details) S(cell.appendParagraph(n.details), { size: 0.95, after: 1, line: 1.05 });
    if (n.contact) S(cell.appendParagraph('Contact: ' + n.contact), { size: 0.85, color: MUTED, after: 4 });
  });

  var link = String(settings['Print Link'] || settings['Site URL'] || '').trim();
  if (!link) return;
  rule_(cell, S);
  var note = 'Find this bulletin online and submit announcements' +
    (snap.deadline ? ' (due ' + snap.deadline + ')' : '') + ':';
  S(cell.appendParagraph(note), { size: 0.85, color: MUTED, align: A.CENTER, after: 2 });
  if (/^y/i.test(String(settings['Print QR Code'] || 'Yes'))) {
    try {
      // The QR code uses the full https address: phone cameras reliably open it as a link,
      // and it keeps working even if the short-link service goes away.
      var target = String(settings['Site URL'] || link).trim();
      if (!/^https?:/i.test(target)) target = 'https://' + target;
      var qr = UrlFetchApp.fetch('https://quickchart.io/qr?size=300&margin=1&text=' +
        encodeURIComponent(target)).getBlob();
      var p = S(cell.appendParagraph(''), { align: A.CENTER, after: 2 });
      p.appendInlineImage(qr).setWidth(72).setHeight(72);
    } catch (e) {
      console.warn('QR code skipped: ' + e);
    }
  }
  if (settings['Print Link']) S(cell.appendParagraph(link), { size: 0.85, align: A.CENTER });
  if (snap.wardWebsite) {
    // Printed without "https://" to save space; it's still a clickable link in the PDF.
    var site = S(cell.appendParagraph('Ward website: ' + snap.wardWebsite.replace(/^https?:[/][/]/, '')),
      { size: 0.8, color: MUTED, align: A.CENTER, before: 6 });
    site.setLinkUrl(snap.wardWebsite);
  }
}

/** rows: [label, value, boldPrefixLength?, prefixLinkUrl?]. Label left, value right-aligned. */
function pairTable_(cell, rows, S, labelW, width, scale, roomy) {
  var t = cell.appendTable(rows.map(function (r) { return [r[0], r[1]]; }));
  t.setBorderWidth(0);
  t.setColumnWidth(0, labelW).setColumnWidth(1, width - labelW);
  rows.forEach(function (r, i) {
    for (var c = 0; c < 2; c++) {
      var tc = t.getCell(i, c);
      tc.setPaddingTop(roomy ? 2.5 : 1).setPaddingBottom(roomy ? 2.5 : 1).setPaddingLeft(0).setPaddingRight(0);
      var p = S(tc.getChild(0).asParagraph(), c === 0
        ? { size: scale * 0.92, color: MUTED }
        : { size: scale, align: DocumentApp.HorizontalAlignment.RIGHT });
      if (c === 1 && r[2]) p.editAsText().setBold(0, r[2] - 1, true);
      if (c === 1 && r[3]) p.editAsText().setLinkUrl(0, r[2] - 1, r[3]).setUnderline(0, r[2] - 1, false)
        .setForegroundColor(0, r[2] - 1, INK); // clickable in the PDF, looks normal on paper
    }
  });
  return t;
}

function rule_(cell, S) {
  var p = S(cell.appendParagraph(''), { size: 0.5, before: 2, after: 4 });
  p.appendHorizontalRule();
}

/** Returns S(paragraph, opts): opts.size is a multiple of the base font size. */
function makeStyler_(font, base) {
  var Att = DocumentApp.Attribute;
  return function (p, o) {
    o = o || {};
    var a = {};
    a[Att.FONT_FAMILY] = font;
    a[Att.FONT_SIZE] = Math.max(1, Math.round(base * (o.size || 1) * 2) / 2);
    a[Att.BOLD] = !!o.bold;
    a[Att.ITALIC] = !!o.italic;
    a[Att.FOREGROUND_COLOR] = o.color || INK;
    p.setAttributes(a);
    p.setAlignment(o.align || DocumentApp.HorizontalAlignment.LEFT);
    p.setSpacingBefore(o.before || 0).setSpacingAfter(o.after || 0).setLineSpacing(o.line || 1);
    return p;
  };
}

function folder_(name) {
  var it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function reuseOrCreateDoc_(folder, name) {
  var it = folder.getFilesByName(name);
  while (it.hasNext()) {
    var f = it.next();
    if (f.getMimeType() === MimeType.GOOGLE_DOCS && !f.isTrashed()) return DocumentApp.openById(f.getId());
  }
  var doc = DocumentApp.create(name);
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}
