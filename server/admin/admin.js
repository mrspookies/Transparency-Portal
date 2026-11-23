/* ==========================================================================
   ADMIN.JS — Transparency Portal console client.
   Vanilla JS, no dependencies. Mirrors the Black Box admin console flow.
   ========================================================================== */

(function () {
  'use strict';

  var API = '/api';

  var passwordInput = document.getElementById('password');
  var loginForm = document.getElementById('login-form');
  var loginError = document.getElementById('login-error');

  var adminStatus = document.getElementById('admin-status');
  var planForm = document.getElementById('plan-form');
  var titleInput = document.getElementById('title');
  var contentInput = document.getElementById('content');
  var saveBtn = document.getElementById('save-btn');
  var logoutBtn = document.getElementById('logout-btn');
  var planMeta = document.getElementById('plan-meta');
  var formError = document.getElementById('form-error');

  var commentForm = document.getElementById('comment-form');
  var commentInput = document.getElementById('comment-input');
  var commentBtn = document.getElementById('comment-btn');
  var commentError = document.getElementById('comment-error');
  var commentList = document.getElementById('comment-list');
  var commentCount = document.getElementById('comment-count');

  var comments = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dateLabel(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toISOString().slice(0, 10).replace(/-/g, '.');
  }

  function setStatus(text, ok) {
    adminStatus.textContent = text;
    adminStatus.classList.toggle('ok', !!ok);
  }

  function setAuthed(authed) {
    document.body.classList.toggle('authed', authed);
    setStatus(authed ? 'SECURE CHANNEL: ONLINE' : 'SECURE CHANNEL: OFFLINE', authed);
    if (authed) {
      loadPlan();
    } else {
      passwordInput.focus();
    }
  }

  function apiError(res, fallback) {
    return res.json().catch(function () { return null; }).then(function (data) {
      return (data && data.error) || fallback;
    });
  }

  /* ------------------------------------------------------------------------
     Auth
     ------------------------------------------------------------------------ */
  loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    loginError.textContent = '';
    fetch(API + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
    }).then(function (res) {
      if (res.ok) {
        passwordInput.value = '';
        return refreshAuth();
      }
      return apiError(res, 'Access denied.').then(function (msg) {
        loginError.textContent = msg;
      });
    }).catch(function () {
      loginError.textContent = 'Connection failed. Is the server running?';
    });
  });

  logoutBtn.addEventListener('click', function () {
    fetch(API + '/logout', { method: 'POST' }).then(function () {
      setAuthed(false);
    });
  });

  function refreshAuth() {
    return fetch(API + '/me')
      .then(function (res) { return res.json(); })
      .then(function (data) { setAuthed(!!data.authed); })
      .catch(function () { setAuthed(false); });
  }

  /* ------------------------------------------------------------------------
     Exit plan
     ------------------------------------------------------------------------ */
  function loadPlan() {
    return fetch(API + '/exit-plan', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load plan');
        return res.json();
      })
      .then(function (data) {
        titleInput.value = data.title || 'Exit Plan';
        contentInput.value = data.content || '';
        planMeta.textContent = 'UPDATED ' + dateLabel(data.updatedAt);
        comments = Array.isArray(data.comments) ? data.comments : [];
        renderComments();
      })
      .catch(function (err) {
        formError.textContent = err.message;
      });
  }

  planForm.addEventListener('submit', function (event) {
    event.preventDefault();
    formError.textContent = '';
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING…';

    fetch(API + '/exit-plan', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: titleInput.value,
        content: contentInput.value,
      }),
    }).then(function (res) {
      if (!res.ok) {
        return apiError(res, 'Save failed.').then(function (msg) { throw new Error(msg); });
      }
      return res.json();
    }).then(function (data) {
      comments = Array.isArray(data.comments) ? data.comments : comments;
      renderComments();
      planMeta.textContent = 'UPDATED ' + dateLabel(data.updatedAt);
      setStatus('LAST SAVE: OK ' + new Date().toTimeString().slice(0, 8), true);
    }).catch(function (err) {
      formError.textContent = err.message || 'Save failed.';
    }).finally(function () {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & export';
    });
  });

  /* ------------------------------------------------------------------------
     Comments
     ------------------------------------------------------------------------ */
  commentForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var content = commentInput.value.trim();
    if (!content) return;
    commentError.textContent = '';
    commentBtn.disabled = true;

    fetch(API + '/exit-plan/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content }),
    }).then(function (res) {
      if (!res.ok) {
        return apiError(res, 'Comment failed.').then(function (msg) { throw new Error(msg); });
      }
      return res.json();
    }).then(function () {
      commentInput.value = '';
      loadPlan();
    }).catch(function (err) {
      commentError.textContent = err.message || 'Comment failed.';
    }).finally(function () {
      commentBtn.disabled = false;
    });
  });

  commentList.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-delete]');
    if (!btn) return;
    var id = Number(btn.dataset.delete);
    if (!window.confirm('Delete this comment permanently?')) return;

    fetch(API + '/comments/' + id, { method: 'DELETE' }).then(function (res) {
      if (!res.ok) {
        return apiError(res, 'Delete failed.').then(function (msg) { throw new Error(msg); });
      }
      comments = comments.filter(function (c) { return c.id !== id; });
      renderComments();
    }).catch(function (err) {
      commentError.textContent = err.message || 'Delete failed.';
    });
  });

  function renderComments() {
    commentCount.textContent = comments.length + (comments.length === 1 ? ' COMMENT' : ' COMMENTS');
    if (!comments.length) {
      commentList.innerHTML = '<p class="empty-list">No comments yet.</p>';
      return;
    }
    commentList.innerHTML = comments.map(function (comment) {
      return (
        '<div class="comment-row">' +
          '<div>' +
            '<div class="comment-head">' + esc(dateLabel(comment.createdAt)) + '</div>' +
            '<div class="comment-text">' + esc(comment.content) + '</div>' +
          '</div>' +
          '<div>' +
            '<button type="button" class="btn btn-ghost" data-delete="' + comment.id + '">Delete</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ------------------------------------------------------------------------
     Init
     ------------------------------------------------------------------------ */
  refreshAuth();
})();
