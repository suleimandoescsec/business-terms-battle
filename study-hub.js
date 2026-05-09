/**
 * Study Hub – fully fixed module.
 * Fixes:
 *  1. Tab switching (formula / paper / vault panels)
 *  2. Subject filtering for every panel (business / chemistry / english)
 *  3. Countdown timer on Paper Drill with urgent animation
 *  4. MCQ drill handling (answer_letter matching, options fallback)
 *  5. Correct mark-scheme display for every drill type
 *  6. Vault rendered with working PDF links
 *  7. Stats bar (formula count, paper set count, drill count)
 */
window.Hub = (function () {

  /* ── helpers ──────────────────────────────────────────────────── */
  const byId = (id) => document.getElementById(id);
  const escHtml = (v = '') =>
    String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ── module state ─────────────────────────────────────────────── */
  let _subject = 'business';
  let _formulas = [];
  let _drills = [];
  let _collections = [];
  let _fIdx = 0;
  let _fRevealed = false;
  let _dQueue = [];
  let _dIdx = 0;
  let _dAnswered = false;
  let _dTimerInterval = null;
  let _dTimeLeft = 0;
  let _dFilterType = 'all';

  /* ── subject-aware data slicing ───────────────────────────────── */
  function sliceData(subject) {
    const raw = window.STUDY_DATA || { formulas: [], paperCollections: [], paperDrills: [] };
    const isChem    = subject === 'chemistry';
    const isEnglish = subject === 'english';

    _collections = raw.paperCollections.filter(item => {
      if (!item.paper_code) return false;
      const c = item.paper_code.toUpperCase();
      if (isChem)    return c.startsWith('4WCH');
      if (isEnglish) return c.startsWith('4EA1');
      // Business P2: must be 4BS1 and usually ending in 02 or 2
      return c.startsWith('4BS1') && (c.includes('02') || c.includes('2'));
    });

    _drills = raw.paperDrills.filter(item => {
      const s = (item.source || '').toUpperCase();
      if (isChem)    return s.includes('4WCH');
      if (isEnglish) return s.includes('4EA1');
      // Business P2: strictly match 02 or 2 patterns
      return s.includes('4BS1') && (s.includes('_02') || s.includes('_2') || s.includes(' P2') || s.includes('PAPER 2'));
    });

    _formulas = raw.formulas.filter(item => {
      const sec = (item.section || '').toLowerCase();
      const isChemF    = sec.includes('ion') || sec.includes('mole') || sec.includes('chemistry');
      const isEnglishF = sec.includes('analysis');
      if (isChem)    return isChemF;
      if (isEnglish) return isEnglishF;
      return !isChemF && !isEnglishF;
    });
  }

  /* ── stats row ────────────────────────────────────────────────── */
  function renderStats() {
    const setText = (id, v) => { const n = byId(id); if (n) n.textContent = String(v); };
    setText('formulaCountStat', _formulas.length);
    setText('paperCountStat',   _collections.length);
    setText('paperDrillCount',  _drills.length);
    const res = _collections.reduce((t, c) => t + (c.assets || []).length, 0);
    setText('resourceCount', res);
  }

  /* ════════════════════════════════════════════════════════════════
     TAB SWITCHING
  ════════════════════════════════════════════════════════════════ */
  function showPanel(view) {
    document.querySelectorAll('[data-study-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.studyView === view);
    });
    document.querySelectorAll('[data-study-panel]').forEach(panel => {
      const show = panel.dataset.studyPanel === view;
      panel.classList.toggle('hidden', !show);
    });
  }

  function initTabs() {
    document.querySelectorAll('[data-study-view]').forEach(btn => {
      btn.addEventListener('click', () => showPanel(btn.dataset.studyView));
    });
  }

  /* ════════════════════════════════════════════════════════════════
     FORMULA LAB
  ════════════════════════════════════════════════════════════════ */
  let _fQueue = [];

  function renderFormula() {
    const title    = byId('formulaPromptTitle');
    const label    = byId('formulaSectionLabel');
    const hint     = byId('formulaPromptHint');
    const chip     = byId('formulaIndexChip');
    const feedback = byId('formulaFeedback');
    if (!title || !label || !feedback) return;

    if (!_fQueue.length) {
      title.textContent   = 'No formula / device data loaded';
      if (label) label.textContent  = 'Formula Lab';
      if (hint)  hint.textContent   = 'No formulas found for this subject.';
      if (chip)  chip.textContent   = '0 / 0';
      feedback.innerHTML  = `<div class="feedback-status">Nothing here yet</div>
        <div class="feedback-body">Add formulas or regenerate study-data.js.</div>`;
      return;
    }

    const item = _fQueue[_fIdx];
    if (label) label.textContent = item.section || 'Formula Lab';
    title.textContent   = item.name || '—';
    if (chip)  chip.textContent  = `${_fIdx + 1} / ${_fQueue.length}`;
    if (hint)  hint.textContent  = _fRevealed
      ? 'Lock the exact wording in memory, then jump to the next card.'
      : 'Say the formula out loud or write it down before revealing.';

    feedback.className = 'feedback';
    feedback.innerHTML = _fRevealed
      ? `<div class="feedback-status">📐 Official Formula</div>
         <div class="feedback-divider"></div>
         <div class="feedback-body"><strong>${escHtml(item.formula)}</strong></div>
         <div class="chips" style="margin-top:1rem">
           <span class="chip">${escHtml(item.notes || 'No extra note')}</span>
         </div>`
      : `<div class="feedback-status">Recall First</div>
         <div class="feedback-divider"></div>
         <div class="feedback-body">Try to recall it before revealing. Include units where relevant.</div>`;
  }

  function revealFormula() { _fRevealed = true;  renderFormula(); }
  function nextFormula()   { _fIdx = (_fIdx + 1) % (_fQueue.length || 1); _fRevealed = false; renderFormula(); }
  function shuffleFormulas() { _fQueue = shuffle(_formulas); _fIdx = 0; _fRevealed = false; renderFormula(); }

  /* ════════════════════════════════════════════════════════════════
     PAPER DRILL  (with countdown timer)
  ════════════════════════════════════════════════════════════════ */

  /* Build a human-readable drill queue filtered by type */
  function buildDrillQueue() {
    let pool = _filterType === 'all' ? _drills : _drills.filter(d => d.type === _filterType);
    _dQueue = shuffle(pool);
    _dIdx   = 0;
  }
  let _filterType = 'all';

  /* Timer helpers */
  function stopDrillTimer() {
    clearInterval(_dTimerInterval);
    _dTimerInterval = null;
  }

  function startDrillTimer(seconds) {
    stopDrillTimer();
    _dTimeLeft = seconds;
    const display = byId('drillTimerDisplay');
    if (!display) return;
    display.classList.remove('urgent');
    display.textContent = _fmtTime(_dTimeLeft);

    _dTimerInterval = setInterval(() => {
      _dTimeLeft--;
      display.textContent = _fmtTime(_dTimeLeft);
      if (_dTimeLeft <= 10) display.classList.add('urgent');
      if (_dTimeLeft <= 0) {
        stopDrillTimer();
        if (!_dAnswered) drillTimeout();
      }
    }, 1000);
  }

  function _fmtTime(s) {
    const m = Math.floor(Math.abs(s) / 60);
    const sec = Math.abs(s) % 60;
    return `${m < 10 ? '0' + m : m}:${sec < 10 ? '0' + sec : sec}`;
  }

  function drillTimeout() {
    _dAnswered = true;
    stopDrillTimer();
    const fb = byId('paperDrillFeedback');
    if (!fb) return;
    const item = _dQueue[_dIdx];
    fb.className = 'feedback bad';
    fb.innerHTML = `<div class="feedback-status">⏱️ Time's Up!</div>
      <div class="feedback-divider"></div>
      <div class="feedback-body">${buildDrillAnswer(item)}</div>`;
    // highlight correct MCQ option
    if (item.type === 'mcq') highlightMcqCorrect(item);
  }

  function renderDrill() {
    stopDrillTimer();

    const meta     = byId('paperDrillMeta');
    const prompt   = byId('paperDrillPrompt');
    const hint     = byId('paperDrillHint');
    const typeChip = byId('paperDrillTypeChip');
    const markChip = byId('paperDrillMarksChip');
    const idxChip  = byId('paperDrillIndexChip');
    const options  = byId('paperDrillOptions');
    const twrap    = byId('paperDrillTypedWrap');
    const feedback = byId('paperDrillFeedback');
    const timer    = byId('drillTimerDisplay');

    if (!meta || !prompt || !options || !twrap || !feedback) return;

    if (!_dQueue.length) {
      meta.textContent    = 'Paper Drill';
      prompt.textContent  = 'No drills match this filter.';
      if (hint)     hint.textContent     = 'Change the filter or switch subject.';
      if (typeChip) typeChip.textContent = 'Empty';
      if (markChip) markChip.textContent = '0 marks';
      if (idxChip)  idxChip.textContent  = '0 / 0';
      if (timer)    timer.textContent    = '00:00';
      options.innerHTML = '';
      twrap.classList.add('hidden');
      feedback.className = 'feedback';
      feedback.innerHTML = `<div class="feedback-status">No data</div>
        <div class="feedback-body">This panel fills with past-paper questions once study data is built.</div>`;
      return;
    }

    _dAnswered = false;
    const item = _dQueue[_dIdx];

    // meta / chips
    meta.textContent    = _niceSource(item.source);
    prompt.textContent  = item.prompt || 'No prompt';
    if (hint)     hint.textContent     = _drillHint(item);
    if (typeChip) typeChip.textContent = _niceType(item.type);
    if (markChip) markChip.textContent = `${item.marks || 0} mark${item.marks === 1 ? '' : 's'}`;
    if (idxChip)  idxChip.textContent  = `${_dIdx + 1} / ${_dQueue.length}`;

    feedback.className = 'feedback';
    feedback.innerHTML = `<div class="feedback-status">Attempt first</div>
      <div class="feedback-divider"></div>
      <div class="feedback-body">Reveal the mark scheme only after committing to an answer.</div>`;

    // choose timer duration by marks
    const timerSecs = _timerForItem(item);
    if (timer) { timer.classList.remove('urgent'); timer.textContent = _fmtTime(timerSecs); }

    // MCQ
    if (item.type === 'mcq') {
      twrap.classList.add('hidden');
      options.innerHTML = '';
      const opts = _getMcqOptions(item);
      opts.forEach((text, i) => {
        const btn = document.createElement('button');
        btn.className = 'option';
        btn.type = 'button';
        btn.innerHTML = `<strong>${String.fromCharCode(65 + i)}.</strong> ${escHtml(text)}`;
        btn.addEventListener('click', () => _answerMcq(btn, item, i, opts));
        options.appendChild(btn);
      });
      startDrillTimer(timerSecs);
      return;
    }

    // typed / short / extended / calculation / definition
    options.innerHTML = '';
    twrap.classList.remove('hidden');
    const ta = byId('paperDrillAnswer');
    if (ta) ta.value = '';
    startDrillTimer(timerSecs);
  }

  /* Determine timer duration */
  function _timerForItem(item) {
    if (item.type === 'mcq')        return 30;
    if (item.type === 'definition') return 45;
    if (item.type === 'calculation') return 90;
    const m = item.marks || 3;
    return Math.max(60, m * 30); // 30 s per mark, min 60s
  }

  /* Human-readable source (strip _MS suffix) */
  function _niceSource(src) {
    if (!src) return 'Past Paper';
    return src.replace(/_MS$/, '').replace(/_/g, ' ');
  }

  function _niceType(t) {
    if (!t) return 'Question';
    return t.replace(/_/g, ' ');
  }

  function _drillHint(item) {
    if (item.type === 'mcq')         return 'Choose the correct option before the timer runs out.';
    if (item.type === 'calculation') return 'Show your full working. Then reveal the mark scheme.';
    if (item.type === 'definition')  return 'Give a tight, one-sentence textbook definition.';
    return `${item.marks || ''}-mark question. Plan your answer, then reveal.`;
  }

  /* Build MCQ options list from item data */
  function _getMcqOptions(item) {
    // If the study data already has an `options` array, use it
    if (Array.isArray(item.options) && item.options.length > 1) return item.options;

    // Otherwise synthesise from answer_text (which often contains all option explanations)
    // Try to extract A–D from answer_text like "A – ... B – ... C – ..."
    const raw = item.answer_text || item.mark_scheme || '';
    const regex = /([A-D])\s*[–\-]\s*([^A-D]+?)(?=[A-D]\s*[–\-]|$)/g;
    const extracted = [];
    let m;
    while ((m = regex.exec(raw)) !== null) {
      extracted.push(m[2].trim().replace(/\s+/g, ' '));
    }
    if (extracted.length >= 2) return extracted;

    // Fallback: show just the correct answer as single item with context
    const correct = item.correct_option || item.answer_text || 'See mark scheme';
    return [correct, '(Other options not captured – check the original paper)'];
  }

  function _answerMcq(clickedBtn, item, chosenIdx, opts) {
    if (_dAnswered) return;
    _dAnswered = true;
    stopDrillTimer();

    // Determine correct index
    const correctLetter = (item.answer_letter || 'A').toUpperCase();
    const correctIdx = correctLetter.charCodeAt(0) - 65;

    const allBtns = byId('paperDrillOptions').querySelectorAll('.option');
    allBtns.forEach((b, i) => {
      if (i === correctIdx) b.classList.add('correct');
      if (i === chosenIdx && i !== correctIdx) b.classList.add('wrong');
    });

    const isCorrect = chosenIdx === correctIdx;
    const fb = byId('paperDrillFeedback');
    fb.className = `feedback ${isCorrect ? 'good' : 'bad'}`;
    fb.innerHTML = isCorrect
      ? `<div class="feedback-status">✅ Correct!</div>
         <div class="feedback-divider"></div>
         <div class="feedback-body">${buildDrillAnswer(item)}</div>`
      : `<div class="feedback-status">❌ Wrong – correct was ${correctLetter}</div>
         <div class="feedback-divider"></div>
         <div class="feedback-body">${buildDrillAnswer(item)}</div>`;
  }

  function highlightMcqCorrect(item) {
    const correctLetter = (item.answer_letter || 'A').toUpperCase();
    const correctIdx = correctLetter.charCodeAt(0) - 65;
    const allBtns = byId('paperDrillOptions').querySelectorAll('.option');
    allBtns.forEach((b, i) => { if (i === correctIdx) b.classList.add('correct'); });
  }

  function revealDrillAnswer() {
    if (!_dQueue.length) return;
    if (_dAnswered) return; // already shown
    _dAnswered = true;
    stopDrillTimer();
    const item = _dQueue[_dIdx];
    const fb = byId('paperDrillFeedback');
    if (!fb) return;
    fb.className = 'feedback';
    fb.innerHTML = `<div class="feedback-status">📝 Mark Scheme</div>
      <div class="feedback-divider"></div>
      <div class="feedback-body">${buildDrillAnswer(item)}</div>`;
    if (item.type === 'mcq') highlightMcqCorrect(item);
  }

  /* Build the answer/mark-scheme HTML for any drill type */
  function buildDrillAnswer(item) {
    if (!item) return 'No data.';

    if (item.type === 'mcq') {
      const letter  = item.answer_letter || '?';
      const explanation = _stripMarkSchemeNoise(item.answer_text || item.correct_option || '');
      return `<strong>Answer: ${escHtml(letter)}</strong><br>${escHtml(explanation)}`;
    }

    if (item.type === 'calculation') {
      const working = _stripMarkSchemeNoise(item.working || '');
      const answer  = item.answer_text || 'See mark scheme';
      return `<strong>Answer: ${escHtml(answer)}</strong>
        ${working ? `<br><br><em>Working:</em><br>${escHtml(working)}` : ''}`;
    }

    // definition / short_answer / extended_answer / generic
    const ms = _stripMarkSchemeNoise(item.mark_scheme || item.answer_text || 'See original paper.');
    return escHtml(ms);
  }

  /* Strip the verbose "AO2 = 3 marks ... Level 1 ... Level 2" boilerplate */
  function _stripMarkSchemeNoise(text) {
    if (!text) return '';
    // Keep only the bullet point lines (lines starting with •)
    const lines = text.split('\n');
    const bullets = lines.filter(l => l.trim().startsWith('•'));
    if (bullets.length > 0) {
      return bullets.map(l => l.trim()).join('\n');
    }
    // Trim Level descriptor noise if no bullets found
    const cut = text.indexOf('Level Mark Descriptor');
    const cut2 = text.indexOf('Level 1 ');
    const cutAt = [cut, cut2].filter(c => c > 0).sort((a, b) => a - b)[0];
    if (cutAt && cutAt > 50) return text.slice(0, cutAt).trim();
    return text.trim();
  }

  function nextDrill() {
    if (!_dQueue.length) return;
    _dIdx = (_dIdx + 1) % _dQueue.length;
    renderDrill();
  }

  function applyDrillFilter(type) {
    _filterType = type || 'all';
    buildDrillQueue();
    renderDrill();
  }

  /* ════════════════════════════════════════════════════════════════
     PAPER VAULT
  ════════════════════════════════════════════════════════════════ */
  function renderVault() {
    const container = byId('paperVaultList');
    if (!container) return;
    container.innerHTML = '';

    if (!_collections.length) {
      container.innerHTML = `<p style="color:var(--color-text-muted)">No past papers found for this subject.</p>`;
      return;
    }

    _collections.forEach(item => {
      const card = document.createElement('article');
      card.className = 'vault-card';
      const assets = (item.assets || [])
        .map(a => `<a class="pill vault-link" href="${encodeURI(a.url)}" target="_blank" rel="noopener">${escHtml(a.label)}</a>`)
        .join('');
      card.innerHTML = `
        <div class="mini">${escHtml(item.subtitle || item.paper_code || 'Resource')}</div>
        <h3 style="margin:4px 0 8px">${escHtml(item.title)}</h3>
        <div class="vault-assets">${assets || '<span style="opacity:.5">No files linked</span>'}</div>`;
      container.appendChild(card);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     BUTTON WIRING
  ════════════════════════════════════════════════════════════════ */
  function initButtons() {
    const wire = (id, fn) => { const el = byId(id); if (el) el.addEventListener('click', fn); };

    wire('revealFormulaBtn',    revealFormula);
    wire('nextFormulaBtn',      nextFormula);
    wire('shuffleFormulasBtn',  shuffleFormulas);

    wire('showPaperAnswerBtn',  revealDrillAnswer);
    wire('nextPaperDrillBtn',   nextDrill);

    // Drill filter buttons (if present)
    wire('drillFilterAll',        () => applyDrillFilter('all'));
    wire('drillFilterMcq',        () => applyDrillFilter('mcq'));
    wire('drillFilterCalc',       () => applyDrillFilter('calculation'));
    wire('drillFilterDefinition', () => applyDrillFilter('definition'));
    wire('drillFilterShort',      () => applyDrillFilter('short_answer'));

    // Legacy select-based filter (kept for compatibility)
    const sel = byId('paperDrillFilter');
    if (sel) {
      sel.addEventListener('change', () => applyDrillFilter(sel.value));
    }

    // Shuffle paper drill
    wire('shufflePaperDrillsBtn', () => applyDrillFilter(_filterType));
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC init()
  ════════════════════════════════════════════════════════════════ */
  function init(subject) {
    _subject = subject || 'business';
    sliceData(_subject);

    // Rebuild formula queue
    _fQueue    = shuffle(_formulas);
    _fIdx      = 0;
    _fRevealed = false;

    // Rebuild drill queue
    _filterType = 'all';
    buildDrillQueue();

    renderStats();
    initTabs();
    initButtons();
    renderFormula();
    renderDrill();
    renderVault();

    // Show formula panel by default
    showPanel('formula');
  }

  return { init };
})();
