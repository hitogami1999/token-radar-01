// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view and the live-token
// set-aside. No network: every byte it shows is in data.js.
//
// The page recomputes each row's implied value from the snapshot figures (TVL, seven-day growth,
// age, chains, and the category comp the snapshot's own live protocols produced) and checks the
// number board.json carries, so the page's code and the board's data are visibly the same
// arithmetic. The farm plan is the board's own plan, written by main.ts from the same record.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the same arithmetic main.ts runs, from the same figures.
  function impliedOf(row) {
    var m = DATA.model;
    var comp = DATA.comps[row.category || 'Other'];
    if (comp === undefined) comp = DATA.global_comp;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_chains);
    var breadthMult = 1 + extra * m.breadth_per_chain;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * comp * growthMult * breadthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    // A new hash is a whole new state: a field the hash does not name is cleared, so
    // moving from a detail view to a filtered view never keeps the old selection.
    state.q = '';
    state.category = 'all';
    state.chain = 'all';
    state.watchOnly = false;
    state.tab = 'pre-token';
    state.selected = null;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watchOnly = true;
    if (params.get('tab') === 'live') state.tab = 'live';
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchOnly) params.set('watch', '1');
    if (state.tab === 'live') params.set('tab', 'live');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchOnly && !r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function rowBySlug(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    return null;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name', html: 'Token <em>Radar</em>' })),
      el('div', { class: 'top-meta' },
        el('span', { class: 'pill', html: 'Snapshot <b>' + DATA.as_of + '</b>' }),
        el('span', { class: 'pill', html: 'Model <b>' + DATA.model_version + '</b>' }),
        el('span', { class: 'pill', html: 'Source <b>DefiLlama</b>' })
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { html: '<span class="hl">' + DATA.watchlist_size + ' watchlist protocols</span>, ranked by what their launch would be worth' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols the watchlist leaves out. Implied value is a model built from the snapshot itself, not a promise — and it never says whether or when a token comes.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' found off the watchlist' })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) }), el('small', { text: 'across the whole board' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top of the board' }), el('b', { text: top ? top.name : 'n/a' }), el('small', { text: top ? fmtUsd(top.implied_value_usd) + ' implied' : '' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watch', checked: state.watchOnly ? 'checked' : null, 'aria-label': 'Watchlist only' });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var shown = state.tab === 'pre-token' ? filteredRows().length : DATA.live.length;
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('label', { class: 'check', for: 'watch' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', html: '<b>' + shown + '</b> rows shown' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null,
          el('span', { class: 'badge pre', text: 'no token' }),
          r.on_watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : null
        )
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are what price the pre-token board.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var compEntries = Object.keys(DATA.comps).sort().map(function (k) {
      return el('span', { html: '<b>' + k + '</b> x' + DATA.comps[k] });
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', html: 'implied = round( tvl_usd x <b>comp(category)</b> x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (1 + min(chains - 1, ' + m.breadth_max_chains + ') x ' + m.breadth_per_chain + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )' }),
      el('p', { text: 'comp(category) is the median market-cap-to-TVL ratio of the snapshot\u2019s live-token protocols in that category (at least ' + m.comp_min_n + ' of them, else the median over every live protocol, ' + DATA.global_comp + '), clamped to [' + m.comp_min + ', ' + m.comp_max + ']. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('div', { class: 'comps' }, compEntries)
    );
  }

  function detailView(row) {
    var recomputed = impliedOf(row);
    var ok = recomputed === row.implied_value_usd;
    var comp = DATA.comps[row.category || 'Other'];
    if (comp === undefined) comp = DATA.global_comp;
    var steps = (row.farm_steps || []).map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
    });
    return el('div', null,
      el('button', { class: 'back', type: 'button', text: '< Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('section', { class: 'detail-head' },
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h1', { text: row.name }),
        el('p', { text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + '  ·  first listed ' + (row.listed_at || 'unknown') + '  ·  ' + fmtAge(row.age_days) + ' with no token on record' }),
        el('div', { class: 'badges' },
          el('span', { class: 'badge pre', text: 'no token on record' }),
          row.on_watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : el('span', { class: 'badge watch', text: 'early find' })
        )
      ),
      el('div', { class: 'grid2' },
        el('section', { class: 'card' },
          el('h2', { text: 'Implied value' }),
          el('div', { class: 'big', text: fmtUsdFull(row.implied_value_usd) }),
          el('p', { class: 'sub', text: 'What a launch would be worth if the protocol\u2019s record stayed as it is. A model\u2019s claim, not a price.' }),
          el('div', { class: 'equation' },
            el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsdFull(row.tvl_usd) })),
            el('div', null, el('span', { text: 'Category comp (' + (row.category || 'Other') + ')' }), el('b', { text: 'x' + comp })),
            el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { text: fmtPct(row.change_7d) + '  →  x' + row.growth_multiplier })),
            el('div', null, el('span', { text: 'Chain breadth (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')' }), el('b', { text: 'x' + row.breadth_multiplier })),
            el('div', null, el('span', { text: 'Maturity (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: 'x' + row.maturity_multiplier })),
            el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsdFull(row.implied_value_usd) }))
          ),
          el('p', { class: 'check-line', html: 'The page recomputes this row as <b>' + fmtUsdFull(recomputed) + '</b>' + (ok ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') })
        ),
        el('section', { class: 'card' },
          el('h3', { text: 'Farm plan' }),
          el('p', { class: 'sub', text: 'Six steps, each with what it costs and how long it takes. Derived from this protocol\u2019s own record.' }),
          el('ol', { class: 'steps' }, steps)
        )
      ),
      el('div', { class: 'note', html: '<b>Read this first:</b> “no token on record” is what the snapshot says, not proof the protocol has no token — a protocol may hold a token its DefiLlama record does not carry. This radar does not predict whether or when a token is issued, and its implied value is the entry\u2019s own claim, never make.fun\u2019s.' })
    );
  }

  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    var row = state.selected ? rowBySlug(state.selected) : null;
    if (row) {
      shell.appendChild(detailView(row));
    } else {
      shell.appendChild(lede());
      shell.appendChild(controls());
      shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
      if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    window.scrollTo(0, 0);
  }

  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
