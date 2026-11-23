/* ==========================================================================
   MARKDOWN.JS — tiny, dependency-free Markdown renderer for the Exit Plan.
   Escapes all HTML first, then applies a safe subset:
   headings, bold, italics, inline code, lists/task lists, tables, rules,
   code fences, and links. Works in the browser and in Node for testing.
   ========================================================================== */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.renderPlanMarkdown = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

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

  function inline(text) {
    var out = text;
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    return out;
  }

  function splitCells(line) {
    var t = line.trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    return t.split('|').map(function (cell) { return cell.trim(); });
  }

  function isTableSeparator(line) {
    var t = line.trim();
    return t.indexOf('|') !== -1 && t.indexOf('-') !== -1 && /^[\s|:-]+$/.test(t);
  }

  function render(source) {
    var text = esc(source).replace(/\r\n?/g, '\n');
    var lines = text.split('\n');
    var out = [];
    var para = [];
    var listType = null;

    function flushParagraph() {
      if (!para.length) return;
      var html = '';
      for (var i = 0; i < para.length; i += 1) {
        var line = para[i];
        var hard = / {2}$/.test(line);
        var content = hard ? line.replace(/ {2}$/, '') : line.trim();
        html += inline(content);
        if (i < para.length - 1) html += hard ? '<br>' : ' ';
      }
      out.push('<p>' + html + '</p>');
      para = [];
    }

    function closeList() {
      if (!listType) return;
      out.push('</' + listType + '>');
      listType = null;
    }

    function openList(type) {
      if (listType === type) return;
      closeList();
      listType = type;
      out.push('<' + type + '>');
    }

    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();

      /* Fenced code block */
      if (trimmed.indexOf('```') === 0) {
        flushParagraph();
        closeList();
        var code = [];
        i += 1;
        while (i < lines.length && lines[i].trim().indexOf('```') !== 0) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }

      /* Blank line — keep a loose list open if another item follows */
      if (!trimmed) {
        flushParagraph();
        if (listType) {
          var peek = i + 1;
          while (peek < lines.length && !lines[peek].trim()) peek += 1;
          var nextLine = lines[peek] || '';
          var continues =
            listType === 'ul'
              ? /^\s*[-*+]\s+/.test(nextLine)
              : /^\s*\d+\.\s+/.test(nextLine);
          if (continues) {
            i += 1;
            continue;
          }
        }
        closeList();
        i += 1;
        continue;
      }

      /* Horizontal rule */
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        flushParagraph();
        closeList();
        out.push('<hr>');
        i += 1;
        continue;
      }

      /* Heading — demote one level so the page keeps a single H1 */
      var heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        var level = Math.min(heading[1].length + 1, 6);
        out.push('<h' + level + '>' + inline(heading[2].trim()) + '</h' + level + '>');
        i += 1;
        continue;
      }

      /* Table */
      if (
        trimmed.indexOf('|') !== -1 &&
        i + 1 < lines.length &&
        isTableSeparator(lines[i + 1])
      ) {
        flushParagraph();
        closeList();
        var header = splitCells(line);
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].indexOf('|') !== -1 && lines[i].trim()) {
          rows.push(splitCells(lines[i]));
          i += 1;
        }
        var table = '<div class="table-wrap"><table><thead><tr>';
        header.forEach(function (cell) { table += '<th>' + inline(cell) + '</th>'; });
        table += '</tr></thead><tbody>';
        rows.forEach(function (row) {
          table += '<tr>';
          for (var c = 0; c < header.length; c += 1) {
            table += '<td>' + inline(row[c] || '') + '</td>';
          }
          table += '</tr>';
        });
        table += '</tbody></table></div>';
        out.push(table);
        continue;
      }

      /* Ordered list */
      var ordered = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ordered) {
        flushParagraph();
        openList('ol');
        out.push('<li>' + inline(ordered[1].trim()) + '</li>');
        i += 1;
        continue;
      }

      /* Unordered / task list */
      var bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        flushParagraph();
        openList('ul');
        var item = bullet[1].trim();
        var task = item.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
          out.push(
            '<li class="task"><input type="checkbox" disabled' +
              (task[1].toLowerCase() === 'x' ? ' checked' : '') +
              '> ' + inline(task[2].trim()) + '</li>'
          );
        } else {
          out.push('<li>' + inline(item) + '</li>');
        }
        i += 1;
        continue;
      }

      /* Paragraph text */
      closeList();
      para.push(line);
      i += 1;
    }

    flushParagraph();
    closeList();
    return out.join('\n');
  }

  return render;
});
