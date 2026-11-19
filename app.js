(function () {
  'use strict';

  var STORAGE_KEY = 'b787quiz.v1';
  var L = window.B787Logic;

  var QUESTIONS = [];
  var QMAP = new Map();
  var storage;
  var state;

  // transient, non-persisted UI state
  var view = 'home'; // 'home' | 'quiz' | 'result' | 'wrongnote'
  var quizTab = 'q'; // 'q' | 'exp'
  var uiTopN = 20;
  var SHOW_TOP_MODE = false; // top-N 오답 모드: 당분간 홈 화면에서 숨김 (기능은 유지)
  var ioPanel = null; // null | 'export' | 'import'
  var resetArmed = false;
  var resetTimer = null;
  var waitingWorker = null; // set once a new SW version is installed and parked, waiting for the user to apply it
  var confirmDialog = null; // { message, action } | null — generic in-app yes/no prompt

  var appEl = document.getElementById('app');
  var bannerEl = document.getElementById('banner');
  var viewerEl = document.getElementById('viewer');
  var viewerImg = document.getElementById('viewerImg');
  var viewerCloseBtn = document.getElementById('viewerClose');

  // ---------------------------------------------------------------- utils
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function pct(x) {
    return Math.round((x || 0) * 100);
  }

  // ---------------------------------------------------------------- state
  function defaultState() {
    return { stats: {}, main: null, session: null, favorites: {}, view: 'home' };
  }

  function loadState() {
    var raw = storage.get(STORAGE_KEY);
    if (!raw) return defaultState();
    try {
      var parsed = JSON.parse(raw);
      var s = defaultState();
      if (parsed && typeof parsed === 'object') {
        s.stats = parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {};
        s.main = parsed.main || null;
        s.session = parsed.session || null;
        s.favorites = parsed.favorites && typeof parsed.favorites === 'object' ? parsed.favorites : {};
        s.view = typeof parsed.view === 'string' ? parsed.view : 'home';
      }
      return s;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    storage.set(STORAGE_KEY, JSON.stringify(state));
  }

  // Keeps the in-memory `view` and the persisted `state.view` in lockstep, so
  // a refresh while sitting on Home stays on Home instead of boot() seeing a
  // lingering (now-resumable) session and jumping back into the quiz.
  function setView(v) {
    view = v;
    state.view = v;
  }

  function idsMatch(order, ids) {
    if (!Array.isArray(order) || order.length !== ids.length) return false;
    var a = new Set(order);
    for (var i = 0; i < ids.length; i++) if (!a.has(ids[i])) return false;
    return true;
  }

  function allIds() {
    return QUESTIONS.map(function (q) { return q.id; });
  }

  function ensureMain() {
    var ids = allIds();
    if (!state.main || !idsMatch(state.main.order, ids)) {
      state.main = { round: 1, order: L.buildRoundOrder(ids, Math.random, null), pos: 0 };
    }
  }

  function rollMainRound() {
    var ids = allIds();
    var prevOrder = state.main.order;
    var prevLast = prevOrder[prevOrder.length - 1];
    state.main = { round: state.main.round + 1, order: L.buildRoundOrder(ids, Math.random, prevLast), pos: 0 };
  }

  function genPerm(id) {
    var q = QMAP.get(id);
    return L.shuffleOptionPerm(q.opts.length, Math.random);
  }

  function currentQuestion() {
    return QMAP.get(state.session.queue[state.session.pos]);
  }

  // Lazily creates (and caches) the per-position record the first time a
  // question at this position is visited, so going back to an earlier
  // position later restores exactly what was shown/chosen there instead of
  // re-shuffling options or losing the answer.
  function currentRecord() {
    var s = state.session;
    if (!s.records[s.pos]) {
      s.records[s.pos] = { perm: genPerm(s.queue[s.pos]), choice: null };
    }
    return s.records[s.pos];
  }

  function isFavorite(id) {
    return !!(state.favorites && state.favorites[id]);
  }

  function toggleFavorite(id) {
    if (!state.favorites) state.favorites = {};
    if (state.favorites[id]) delete state.favorites[id];
    else state.favorites[id] = true;
    saveState();
    render();
  }

  function totalStats() {
    var seen = 0, correct = 0;
    for (var id in state.stats) {
      if (!Object.prototype.hasOwnProperty.call(state.stats, id)) continue;
      seen += state.stats[id].seen || 0;
      correct += state.stats[id].correct || 0;
    }
    return { seen: seen, correct: correct, rate: seen ? correct / seen : 0 };
  }

  function wrongEligibleCount() {
    var ids = allIds();
    var n = 0;
    for (var i = 0; i < ids.length; i++) {
      if (L.isWrongEligible(state.stats[ids[i]])) n++;
    }
    return n;
  }

  function rankComparator(a, b) {
    var sa = state.stats[a], sb = state.stats[b];
    var ra = L.wrongRate(sa), rb = L.wrongRate(sb);
    if (rb !== ra) return rb - ra;
    return (sb ? sb.wrong : 0) - (sa ? sa.wrong : 0);
  }

  // ------------------------------------------------------------ sessions
  // A session is "resumable" if it's the same mode and hasn't been finished
  // yet — in that case re-entering a mode from Home should continue exactly
  // where it was left (same queue, same position, same answered/unanswered
  // state per question), not silently rebuild a new queue/score from zero.
  function resumable(mode) {
    var s = state.session;
    return !!(s && s.mode === mode && s.pos < s.queue.length);
  }

  function startMainSession() {
    ensureMain();
    if (state.main.pos >= state.main.order.length) rollMainRound();
    if (resumable('main')) { setView('quiz'); quizTab = 'q'; saveState(); render(); return; }
    state.session = { mode: 'main', queue: state.main.order, pos: state.main.pos, records: {}, score: 0, wrongIds: [] };
    setView('quiz'); quizTab = 'q';
    saveState(); render();
  }

  function startWrongSession() {
    if (resumable('wrong')) { setView('quiz'); quizTab = 'q'; saveState(); render(); return; }
    var queue = L.buildWrongQueue(state.stats, allIds(), Math.random);
    if (queue.length === 0) return;
    state.session = { mode: 'wrong', queue: queue, pos: 0, records: {}, score: 0, wrongIds: [] };
    setView('quiz'); quizTab = 'q';
    saveState(); render();
  }

  function startTopSession(n) {
    if (resumable('top')) { setView('quiz'); quizTab = 'q'; saveState(); render(); return; }
    var queue = L.buildTopQueue(state.stats, allIds(), n, Math.random);
    if (queue.length === 0) return;
    state.session = { mode: 'top', queue: queue, pos: 0, records: {}, score: 0, wrongIds: [] };
    setView('quiz'); quizTab = 'q';
    saveState(); render();
  }

  function startSingleSession(id) {
    var s = state.session;
    if (s && s.mode === 'single' && s.queue[0] === id && s.pos < s.queue.length) {
      setView('quiz'); quizTab = 'q'; saveState(); render(); return;
    }
    state.session = { mode: 'single', queue: [id], pos: 0, records: {}, score: 0, wrongIds: [] };
    setView('quiz'); quizTab = 'q';
    saveState(); render();
  }

  function answerOption(displayedPos) {
    var s = state.session;
    if (!s) return;
    var rec = currentRecord();
    if (rec.choice !== null) return; // already answered; ignore stray clicks
    var q = currentQuestion();
    var originalIdx = rec.perm[displayedPos];
    var correct = originalIdx === q.ans;
    rec.choice = originalIdx;
    if (correct) s.score++;
    else s.wrongIds.push(q.id);
    state.stats[q.id] = L.updateStat(state.stats[q.id], correct, Date.now());
    saveState();
    render();
  }

  function goNext() {
    var s = state.session;
    if (!s) return;
    var rec = currentRecord();
    if (rec.choice === null) return; // must answer the current question first
    s.pos++;
    if (s.mode === 'main') state.main.pos = s.pos;
    if (s.pos >= s.queue.length) {
      if (s.mode === 'main' && state.main.pos >= state.main.order.length) rollMainRound();
      setView('result');
      saveState(); render();
      return;
    }
    quizTab = 'q';
    saveState(); render();
  }

  // Steps back to the previous question in this session, restoring exactly
  // how it was answered (or left unanswered) — never re-scores it.
  function goPrev() {
    var s = state.session;
    if (!s || s.pos === 0) return;
    s.pos--;
    if (s.mode === 'main') state.main.pos = s.pos;
    quizTab = 'q';
    saveState(); render();
  }

  function requestGoPrev() {
    if (!state.session || state.session.pos === 0) return;
    confirmDialog = { message: '이전 문제로 돌아가시겠습니까?', action: 'go-prev' };
    render();
  }

  function resultRetry() {
    var mode = state.session.mode;
    if (mode === 'main') startMainSession();
    else if (mode === 'wrong') startWrongSession();
    else if (mode === 'top') startTopSession(uiTopN);
    else if (mode === 'single') startSingleSession(state.session.queue[0]);
  }

  function goHome() {
    setView('home');
    saveState(); render();
  }

  // ------------------------------------------------------------- export/import
  function exportPayload() {
    return JSON.stringify({ stats: state.stats, main: state.main });
  }

  function doCopyExport() {
    var payload = exportPayload();
    var ta = document.querySelector('[data-role="export-text"]');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        showIoMsg('복사되었습니다.');
      }).catch(function () {
        if (ta) { ta.focus(); ta.select(); }
        showIoMsg('자동 복사에 실패했습니다. 아래 텍스트를 직접 복사하세요.');
      });
    } else if (ta) {
      ta.focus(); ta.select();
      showIoMsg('아래 텍스트를 직접 복사하세요 (Ctrl/Cmd+C).');
    }
  }

  function doConfirmImport() {
    var ta = document.getElementById('importText');
    if (!ta) return;
    try {
      var parsed = JSON.parse(ta.value);
      if (!parsed || typeof parsed !== 'object' || typeof parsed.stats !== 'object') {
        throw new Error('invalid shape');
      }
      state.stats = parsed.stats || {};
      state.main = parsed.main && Array.isArray(parsed.main.order) ? parsed.main : null;
      ensureMain();
      saveState();
      ioPanel = null;
      render();
    } catch (e) {
      showIoMsg('가져오기 실패: JSON 형식을 확인하세요.');
    }
  }

  function showIoMsg(msg) {
    var el = document.getElementById('ioMsg');
    if (el) el.textContent = msg;
  }

  // ------------------------------------------------------------- reset
  function handleResetClick() {
    if (!resetArmed) {
      resetArmed = true;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { resetArmed = false; render(); }, 4000);
      render();
    } else {
      clearTimeout(resetTimer);
      resetArmed = false;
      state = defaultState();
      ensureMain();
      setView('home');
      saveState();
      render();
    }
  }

  // ------------------------------------------------------------- viewer
  function openViewer(src) {
    viewerImg.src = src;
    viewerEl.hidden = false;
  }
  function closeViewer() {
    viewerEl.hidden = true;
    viewerImg.src = '';
  }
  viewerCloseBtn.addEventListener('click', closeViewer);
  viewerEl.addEventListener('click', function (e) {
    if (e.target === viewerEl) closeViewer();
  });

  // ------------------------------------------------------------- render: home
  function renderHome() {
    ensureMain();
    var totals = totalStats();
    var wrongCount = wrongEligibleCount();
    var roundPct = pct(state.main.order.length ? state.main.pos / state.main.order.length : 0);

    var ioPanelHtml = '';
    if (ioPanel === 'export') {
      ioPanelHtml =
        '<div class="stat-card">' +
          '<div class="label">아래 텍스트를 복사해서 보관하세요</div>' +
          '<textarea data-role="export-text" readonly style="width:100%;height:120px;margin-top:8px;font-size:12px;font-family:monospace">' +
            escapeHtml(exportPayload()) +
          '</textarea>' +
          '<div class="io-row" style="margin-top:8px">' +
            '<button class="ghost-btn" data-action="copy-export">복사</button>' +
            '<button class="ghost-btn" data-action="close-panel">닫기</button>' +
          '</div>' +
          '<div id="ioMsg" style="font-size:12px;color:var(--text-dim);margin-top:6px"></div>' +
        '</div>';
    } else if (ioPanel === 'import') {
      ioPanelHtml =
        '<div class="stat-card">' +
          '<div class="label">내보낸 텍스트를 붙여넣으세요</div>' +
          '<textarea id="importText" style="width:100%;height:120px;margin-top:8px;font-size:12px;font-family:monospace" placeholder="여기에 붙여넣기"></textarea>' +
          '<div class="io-row" style="margin-top:8px">' +
            '<button class="ghost-btn" data-action="confirm-import">가져오기</button>' +
            '<button class="ghost-btn" data-action="close-panel">닫기</button>' +
          '</div>' +
          '<div id="ioMsg" style="font-size:12px;color:var(--bad);margin-top:6px"></div>' +
        '</div>';
    }

    var updateBtnHtml = waitingWorker
      ? '<button class="update-pill" data-action="apply-update">업데이트</button>'
      : '';

    appEl.innerHTML =
      '<div class="home">' +
        '<div class="home-header"><h1>B787 RATING</h1>' + updateBtnHtml + '</div>' +
        '<div class="mode-list">' +
          '<button class="mode-btn" data-action="start-main">' +
            '<div><div class="title">메인 모드</div><div class="desc">전체 문제를 순서대로 (이어서) 풉니다</div></div>' +
            '<div class="arrow">›</div>' +
          '</button>' +
          '<button class="mode-btn" data-action="start-wrong"' + (wrongCount === 0 ? ' disabled' : '') + '>' +
            '<div><div class="title">오답 모드</div><div class="desc">자주 틀리는 문제 위주 (' + wrongCount + '개)</div></div>' +
            '<div class="arrow">›</div>' +
          '</button>' +
          '<button class="mode-btn" data-action="open-wrongnote">' +
            '<div><div class="title">오답 노트</div><div class="desc">오답률 순으로 모아보기</div></div>' +
            '<div class="arrow">›</div>' +
          '</button>' +
          (SHOW_TOP_MODE ?
            '<div class="mode-btn" style="cursor:default;display:block">' +
              '<div class="title">상위 오답 모드</div>' +
              '<div class="segment" style="margin-top:8px">' +
                [10, 20, 30, 50].map(function (n) {
                  return '<button data-n="' + n + '" aria-pressed="' + (n === uiTopN) + '">' + n + '</button>';
                }).join('') +
              '</div>' +
              '<button class="mode-btn" data-action="start-top" style="margin-top:8px;padding:10px;justify-content:center">상위 ' + uiTopN + '개 시작</button>' +
            '</div>'
          : '') +
        '</div>' +
        '<div class="stat-compact">' +
          '<div class="stat-compact-row">' +
            '<div class="stat-compact-item"><span class="v">' + roundPct + '%</span><span class="l">진행률 (' + state.main.pos + '/' + state.main.order.length + ')</span></div>' +
            '<div class="stat-compact-item"><span class="v">' + pct(totals.rate) + '%</span><span class="l">정답률</span></div>' +
            '<div class="stat-compact-item"><span class="v">' + wrongCount + '</span><span class="l">오답 문제</span></div>' +
          '</div>' +
          '<div class="progress-bar"><div style="width:' + roundPct + '%"></div></div>' +
        '</div>' +
        '<div class="io-row">' +
          '<button class="ghost-btn" data-action="export">기록 내보내기</button>' +
          '<button class="ghost-btn" data-action="import">기록 가져오기</button>' +
        '</div>' +
        ioPanelHtml +
        '<button class="ghost-btn danger-btn" data-action="reset">' +
          (resetArmed ? '정말 삭제할까요? 다시 누르면 초기화됩니다' : '기록 초기화') +
        '</button>' +
      '</div>';
  }

  // ------------------------------------------------------------- render: quiz
  var MODE_NAMES = { main: '메인', wrong: '오답', top: '상위 오답', single: '단일' };
  var LABELS = ['가', '나', '다', '라'];

  function renderQuiz() {
    var s = state.session;
    var q = currentQuestion();
    var rec = currentRecord();
    var answered = rec.choice !== null;
    var total = s.queue.length;
    var idx = s.pos;
    var progressPct = pct((idx + (answered ? 1 : 0)) / total);
    var stat = state.stats[q.id];
    var historyNote = stat && stat.seen > 0 ? '이 문제 ' + stat.seen + '회 중 ' + stat.wrong + '회 틀림' : '';

    var optionsHtml = q.opts.map(function (_, i) {
      var originalIdx = rec.perm[i];
      var text = q.opts[originalIdx];
      var cls = 'option';
      if (answered) {
        if (originalIdx === q.ans) cls += ' correct';
        else if (originalIdx === rec.choice) cls += ' wrong';
      }
      return '<button class="' + cls + '" data-pos="' + i + '"' + (answered ? ' disabled' : '') + '>' +
        '<span class="mark">' + LABELS[i] + '.</span>' +
        '<span class="body">' + escapeHtml(text) + '</span>' +
        '</button>';
    }).join('');

    var bodyHtml;
    if (quizTab === 'exp') {
      if (!q.exp || q.exp.length === 0) {
        bodyHtml = '<div class="exp-empty">이 문제에는 해설이 없습니다.</div>';
      } else {
        bodyHtml = q.exp.map(function (item) {
          if (item.t === 'img') {
            var src = 'data/' + item.v;
            return '<img class="exp-img" src="' + src + '" data-full="' + src + '" alt="해설 이미지">';
          }
          return '<div class="exp-html">' + item.v + '</div>';
        }).join('');
      }
    } else {
      var fav = isFavorite(q.id);
      bodyHtml =
        '<div class="chips">' +
          '<div class="chip-group"><span class="chip">' + escapeHtml(q.ch) + '</span><span class="chip">' + escapeHtml(q.code) + '</span></div>' +
          '<button class="star-btn' + (fav ? ' active' : '') + '" data-action="toggle-fav" data-id="' + q.id + '" aria-label="즐겨찾기">' + (fav ? '★' : '☆') + '</button>' +
        '</div>' +
        '<div class="question-text">' + escapeHtml(q.q) + '</div>' +
        (q.ref ? '<div class="ref-text">' + escapeHtml(q.ref) + '</div>' : '') +
        (answered && historyNote ? '<div class="history-note">' + historyNote + '</div>' : '') +
        '<div class="options">' + optionsHtml + '</div>';
    }

    var prevBtnHtml = s.pos > 0 ? '<button class="prev-btn" data-action="prev">이전</button>' : '';

    appEl.innerHTML =
      '<div class="topbar">' +
        '<button data-action="back" aria-label="뒤로">←</button>' +
        '<div class="mode-name">' + MODE_NAMES[s.mode] + '</div>' +
        '<div class="counter">' + (idx + 1) + ' / ' + total + '</div>' +
      '</div>' +
      '<div class="topbar-progress"><div style="width:' + progressPct + '%"></div></div>' +
      '<div class="quiz-body">' +
        '<div class="tabs">' +
          '<button data-tab="q" aria-pressed="' + (quizTab === 'q') + '">문제</button>' +
          '<button data-tab="exp" aria-pressed="' + (quizTab === 'exp') + '"' + (!answered ? ' disabled' : '') + '>해설</button>' +
        '</div>' +
        bodyHtml +
      '</div>' +
      '<div class="bottom-bar">' + prevBtnHtml +
        '<button class="next-btn" data-action="next"' + (!answered ? ' disabled' : '') + '>다음</button>' +
      '</div>' +
      renderConfirmOverlay();
  }

  function renderConfirmOverlay() {
    if (!confirmDialog) return '';
    return (
      '<div class="confirm-overlay">' +
        '<div class="confirm-box">' +
          '<div class="msg">' + escapeHtml(confirmDialog.message) + '</div>' +
          '<div class="confirm-actions">' +
            '<button class="btn-secondary" data-action="confirm-no">아니오</button>' +
            '<button class="btn-primary" data-action="confirm-yes">예</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ------------------------------------------------------------- render: result
  function renderResult() {
    var s = state.session;
    var wrongQs = s.wrongIds.map(function (id) { return QMAP.get(id); });
    var wrongHtml = wrongQs.length
      ? '<div class="wrong-list">' + wrongQs.map(function (q) {
          return '<div class="row">[' + escapeHtml(q.code) + '] ' + escapeHtml(truncate(q.q, 40)) + '</div>';
        }).join('') + '</div>'
      : '<div class="history-note">전부 맞혔습니다!</div>';

    appEl.innerHTML =
      '<div class="result">' +
        '<div class="mode-name">' + MODE_NAMES[s.mode] + ' 결과</div>' +
        '<div class="score">' + s.score + ' <small>/ ' + s.queue.length + '</small></div>' +
        wrongHtml +
        '<div class="result-actions">' +
          '<button class="btn-secondary" data-action="home">홈</button>' +
          '<button class="btn-primary" data-action="retry">다시</button>' +
        '</div>' +
      '</div>';
  }

  // ------------------------------------------------------------- render: wrongnote
  function renderWrongNote() {
    var ids = allIds().filter(function (id) {
      var st = state.stats[id];
      return st && st.seen > 0 && st.wrong > 0;
    }).sort(rankComparator);

    var listHtml;
    if (ids.length === 0) {
      listHtml = '<div class="wrongnote-empty">아직 오답 기록이 없습니다.</div>';
    } else {
      listHtml = '<div class="wrongnote-list">' + ids.map(function (id) {
        var q = QMAP.get(id);
        var st = state.stats[id];
        var rate = L.wrongRate(st);
        return '<button class="wrongnote-item" data-id="' + id + '">' +
          '<div class="top-row"><span>' + escapeHtml(q.code) + '</span><span>틀림 ' + st.wrong + ' / 시도 ' + st.seen + '</span></div>' +
          '<div class="q-text">' + escapeHtml(truncate(q.q, 50)) + '</div>' +
          '<div class="rate-bar"><div style="width:' + pct(rate) + '%"></div></div>' +
        '</button>';
      }).join('') + '</div>';
    }

    appEl.innerHTML =
      '<div class="topbar"><button data-action="back" aria-label="뒤로">←</button><div class="mode-name">오답 노트</div></div>' +
      listHtml;
  }

  // ------------------------------------------------------------- dispatch
  function render() {
    if (view === 'home') renderHome();
    else if (view === 'quiz') renderQuiz();
    else if (view === 'result') renderResult();
    else if (view === 'wrongnote') renderWrongNote();
  }

  appEl.addEventListener('click', function (e) {
    var optBtn = e.target.closest('.option');
    if (optBtn && view === 'quiz') { answerOption(Number(optBtn.dataset.pos)); return; }

    var tabBtn = e.target.closest('[data-tab]');
    if (tabBtn) {
      if (tabBtn.disabled) return;
      quizTab = tabBtn.dataset.tab;
      render();
      return;
    }

    var img = e.target.closest('.exp-img');
    if (img) { openViewer(img.dataset.full); return; }

    var nBtn = e.target.closest('[data-n]');
    if (nBtn) { uiTopN = Number(nBtn.dataset.n); render(); return; }

    var wnItem = e.target.closest('.wrongnote-item');
    if (wnItem) { startSingleSession(wnItem.dataset.id); return; }

    var actionEl = e.target.closest('[data-action]');
    if (!actionEl || actionEl.disabled) return;
    switch (actionEl.dataset.action) {
      case 'start-main': startMainSession(); break;
      case 'start-wrong': startWrongSession(); break;
      case 'start-top': startTopSession(uiTopN); break;
      case 'open-wrongnote': setView('wrongnote'); saveState(); render(); break;
      case 'back': goHome(); break;
      case 'home': goHome(); break;
      case 'retry': resultRetry(); break;
      case 'next': goNext(); break;
      case 'prev': requestGoPrev(); break;
      case 'confirm-yes':
        var pendingAction = confirmDialog && confirmDialog.action;
        confirmDialog = null;
        if (pendingAction === 'go-prev') goPrev(); else render();
        break;
      case 'confirm-no': confirmDialog = null; render(); break;
      case 'toggle-fav': toggleFavorite(actionEl.dataset.id); break;
      case 'export': ioPanel = ioPanel === 'export' ? null : 'export'; render(); break;
      case 'import': ioPanel = ioPanel === 'import' ? null : 'import'; render(); break;
      case 'close-panel': ioPanel = null; render(); break;
      case 'copy-export': doCopyExport(); break;
      case 'confirm-import': doConfirmImport(); break;
      case 'reset': handleResetClick(); break;
      case 'apply-update': applyUpdate(); break;
    }
  });

  // Test-only hook (Playwright UI tests): lets a test find which displayed
  // position is currently correct without guessing via reload-and-retry,
  // since option order is reshuffled on every new session. Not referenced
  // by any in-app UI code path.
  window.__b787Test = {
    correctDisplayPos: function () {
      if (!state || !state.session) return null;
      var q = currentQuestion();
      return currentRecord().perm.indexOf(q.ans);
    },
  };

  // ------------------------------------------------------------- update check
  // Skip entirely under browser automation (Playwright, etc.) — the SW's
  // install step fetches every asset + explanation image, which only adds
  // load to test runs and has no bearing on what's tested.
  function setupServiceWorker() {
    if (!('serviceWorker' in navigator) || navigator.webdriver) return;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      location.reload();
    });

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      function markWaiting(worker) {
        waitingWorker = worker;
        if (view === 'home') render();
      }
      // an update may already be sitting there waiting if this tab was open
      // when it finished installing in the background
      if (reg.waiting && navigator.serviceWorker.controller) markWaiting(reg.waiting);

      reg.addEventListener('updatefound', function () {
        var installing = reg.installing;
        if (!installing) return;
        installing.addEventListener('statechange', function () {
          // "installed" + an existing controller means this is a genuine
          // update (not the very first install), so it's safe to offer
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            markWaiting(reg.waiting || installing);
          }
        });
      });
    }).catch(function () {});
  }

  function applyUpdate() {
    if (!waitingWorker) return;
    waitingWorker.postMessage('SKIP_WAITING');
  }

  // ------------------------------------------------------------- boot
  function boot() {
    var backend = null;
    try { backend = window.localStorage; } catch (e) { backend = null; }
    storage = L.createSafeStorage(backend);

    fetch('data/questions.json')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        QUESTIONS = data;
        QMAP = new Map(QUESTIONS.map(function (q) { return [q.id, q]; }));
        state = loadState();
        ensureMain();
        if (!storage.available) bannerEl.hidden = false;

        // test-only deterministic entry point, e.g. index.html?qid=p104
        var qid = new URLSearchParams(location.search).get('qid');
        if (qid && QMAP.has(qid)) {
          startSingleSession(qid);
          return;
        }

        // Restore whatever screen was last shown. Guard against a stale
        // 'quiz'/'result' pointing at a session that's missing or already
        // finished (e.g. imported stats with no matching session) so we
        // never render a blank/broken quiz screen.
        view = state.view || 'home';
        var sessionUsable = state.session && state.session.pos < state.session.queue.length;
        if (view === 'quiz' && !sessionUsable) view = 'home';
        if (view === 'result' && !state.session) view = 'home';
        render();

        setupServiceWorker();
      })
      .catch(function () {
        appEl.innerHTML = '<div class="home"><p>문제 데이터를 불러오지 못했습니다. 네트워크 연결을 확인하세요.</p></div>';
      });
  }

  boot();
})();
