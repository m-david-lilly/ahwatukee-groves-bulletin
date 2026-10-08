// api.js — the website's connection to the spreadsheet (an Apps Script web app that only
// returns JSON). Pages are served from GitHub Pages, so no Google banner appears.
var BULLETIN_API = 'https://script.google.com/macros/s/AKfycbw-Cb7mE0-v5aSE7MFxccmJ_NhMenz6HFykGV3Xo3IYLNhfteh_e4BfXQj3Sim6dANk/exec';

function apiGet(params) {
  if (window.MOCK_API) return window.MOCK_API('GET', params);
  var q = Object.keys(params).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return fetch(BULLETIN_API + '?' + q).then(readApi_);
}

// text/plain keeps this a "simple" request, so the browser doesn't send a CORS preflight
// (Apps Script can't answer one).
function apiPost(body) {
  if (window.MOCK_API) return window.MOCK_API('POST', body);
  return fetch(BULLETIN_API, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  }).then(readApi_);
}

function readApi_(r) {
  if (!r.ok) throw new Error('The bulletin server returned an error (' + r.status + '). Please try again.');
  return r.json().then(function (j) {
    if (!j.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
    return j.data;
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
