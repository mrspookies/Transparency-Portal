/* ==========================================================================
   EXITPLAN.JS — Client-side renderer for the Transparency Portal.
   Reads the plan from the local backend (/api), then localhost, then the
   static mirror at /data/exit-plan.json. Mirrors js/blackbox.js.
   ========================================================================== */

(function () {
  'use strict';

  var stackEl = document.getElementById('plan-stack');
  var statusEl = document.getElementById('status-line');
  var commentsEl = document.getElementById('comments-stack');
  var yearEl = document.getElementById('year');
  if (!stackEl) return;

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* Source 1: same origin (local backend or static host).
     Source 2: explicit loopback fallback for Live Server / file:// previews.
     Source 3: committed static mirror — always works on GitHub Pages. */
  var SOURCES = [
    '/api/exit-plan',
    'http://localhost:5001/api/exit-plan',
    '/data/exit-plan.json',
  ];

  function fetchJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function loadPlan() {
    var i = 0;
    function next() {
      if (i >= SOURCES.length) return Promise.reject(new Error('no sources left'));
      var url = SOURCES[i];
      i += 1;
      return fetchJson(url).catch(next);
    }
    return next();
  }

  loadPlan()
    .then(function (data) {
      if (!data || typeof data.content !== 'string' || !data.content.trim()) {
        renderQuiet('empty');
        return;
      }
      render(data);
    })
    .catch(function () {
      renderQuiet('no-feed');
    });

  /* ------------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------------ */
  function render(data) {
    var comments = Array.isArray(data.comments) ? data.comments : [];
    if (statusEl) {
      statusEl.textContent =
        'PLAN RETRIEVED: ' + dateLabel(data.updatedAt) +
        ' / COMMENTS: ' + comments.length;
    }

    var html = '';
    html += '<article class="log-entry">';
    html += '<div class="log-meta">' +
      '<span>Exit Plan</span>' +
      '<span>' + esc(data.updatedBy || 'Owner') + '</span>' +
      '</div>';
    var markdown = typeof window.renderPlanMarkdown === 'function' ? window.renderPlanMarkdown : null;
    html += '<div class="exit-body">' + (markdown ? markdown(data.content) : esc(data.content)) + '</div>';
    html += '<div class="log-meta exit-byline">' +
      '<span>Updated ' + esc(dateLabel(data.updatedAt)) + '</span>' +
      '<span>Entry 1</span>' +
      '</div>';
    html += '</article>';
    stackEl.innerHTML = html;

    if (!commentsEl) return;
    if (!comments.length) {
      commentsEl.innerHTML = '<p class="comment-empty">No comments yet.</p>';
      return;
    }
    commentsEl.innerHTML = comments.map(function (comment) {
      return (
        '<article class="log-entry">' +
          '<div class="log-meta">' +
            '<span>' + esc(comment.author || 'Owner') + '</span>' +
            '<span>' + esc(dateLabel(comment.createdAt)) + '</span>' +
          '</div>' +
          '<div class="comment-body">' + esc(comment.content) + '</div>' +
        '</article>'
      );
    }).join('');
  }

  function renderQuiet(reason) {
    if (statusEl) {
      statusEl.textContent = 'PLAN RETRIEVED: 0 — AWAITING FIRST TRANSMISSION';
    }
    var note = reason === 'no-feed'
      ? 'The channel is quiet — the plan could not be reached. Try again shortly.'
      : 'The plan has not been published yet. It appears here the moment it is saved.';
    stackEl.innerHTML =
      '<article class="log-entry">' +
        '<div class="log-meta"><span>Status</span><span>Awaiting Input</span></div>' +
        '<h3>No plan retrieved</h3>' +
        '<p>' + esc(note) + '</p>' +
      '</article>';
    if (commentsEl) commentsEl.innerHTML = '';
  }

  /* ------------------------------------------------------------------------
     Helpers
     ------------------------------------------------------------------------ */
  function dateLabel(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10).replace(/-/g, '.');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c];
    });
  }
})();
