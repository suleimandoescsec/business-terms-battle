(function () {
  const data = window.STUDY_DATA || {
    formulas: [],
    paperCollections: [],
    paperDrills: [],
    examinerPlaybook: [],
  };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value = "") =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const state = {
    formulaQueue: shuffle(data.formulas),
    formulaIndex: 0,
    formulaRevealed: false,
    paperFilter: "all",
    paperQueue: [],
    paperIndex: 0,
    paperAnswered: false,
  };

  function setText(id, value) {
    const node = byId(id);
    if (node) node.textContent = value;
  }

  function initialiseStats() {
    const paperSets = data.paperCollections.filter((item) => item.paper_code).length;
    setText("formulaCountStat", String(data.formulas.length));
    setText("paperCountStat", String(paperSets));
    setText("paperDrillCount", String(data.paperDrills.length));
    const resourceCount = data.paperCollections.reduce((total, item) => total + ((item.assets || []).length), 0);
    setText("resourceCount", String(resourceCount));
  }

  function showStudyView(view) {
    document.querySelectorAll("[data-study-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.studyView === view);
    });
    document.querySelectorAll("[data-study-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.studyPanel === view);
    });
  }

  function initialiseStudyTabs() {
    document.querySelectorAll("[data-study-view]").forEach((button) => {
      button.addEventListener("click", () => showStudyView(button.dataset.studyView));
    });
  }

  function renderFormulaCard() {
    const title = byId("formulaPromptTitle");
    const label = byId("formulaSectionLabel");
    const hint = byId("formulaPromptHint");
    const chip = byId("formulaIndexChip");
    const feedback = byId("formulaFeedback");
    if (!title || !label || !hint || !chip || !feedback) return;

    if (!state.formulaQueue.length) {
      title.textContent = "No formula data loaded";
      label.textContent = "Formula Lab";
      hint.textContent = "Add a formula PDF and regenerate study-data.js to populate this area.";
      chip.textContent = "0 / 0";
      feedback.innerHTML = `<div class="feedback-status">Waiting for formulas</div><div class="feedback-body">The formula flashcards appear here after the study data build runs.</div>`;
      return;
    }

    const item = state.formulaQueue[state.formulaIndex];
    label.textContent = item.section;
    title.textContent = item.name;
    hint.textContent = state.formulaRevealed
      ? "Lock the exact wording in memory, then jump to the next card."
      : "Say the formula out loud or write it down before revealing the official version.";
    chip.textContent = `${state.formulaIndex + 1} / ${state.formulaQueue.length}`;
    feedback.className = "feedback";
    feedback.innerHTML = state.formulaRevealed
      ? `
        <div class="feedback-status">📐 Official Formula</div>
        <div class="feedback-divider"></div>
        <div class="feedback-body"><strong>${escapeHtml(item.formula)}</strong></div>
        <div class="chips" style="margin-top: 1rem;">
          <span class="chip">${escapeHtml(item.notes || "No extra note")}</span>
        </div>
      `
      : `
        <div class="feedback-status">Recall First</div>
        <div class="feedback-divider"></div>
        <div class="feedback-body">Try to write the formula from memory before you reveal it. Include the final unit if the note asks for one.</div>
      `;
  }

  function showFormulaAnswer() {
    state.formulaRevealed = true;
    renderFormulaCard();
  }

  function nextFormula() {
    if (!state.formulaQueue.length) return;
    state.formulaIndex = (state.formulaIndex + 1) % state.formulaQueue.length;
    state.formulaRevealed = false;
    renderFormulaCard();
  }

  function shuffleFormulas() {
    state.formulaQueue = shuffle(data.formulas);
    state.formulaIndex = 0;
    state.formulaRevealed = false;
    renderFormulaCard();
  }

  function getPaperQueue() {
    if (state.paperFilter === "all") return shuffle(data.paperDrills);
    return shuffle(data.paperDrills.filter((item) => item.type === state.paperFilter));
  }

  function applyPaperFilter() {
    state.paperQueue = getPaperQueue();
    state.paperIndex = 0;
    state.paperAnswered = false;
    renderPaperDrill();
  }

  function getPaperHint(item) {
    if (item.type === "mcq") return "Answer the real paper question, then check the official mark scheme.";
    if (item.type === "calculation") return "Do the working on paper first. Then reveal the exact substitution and answer.";
    if (item.type === "definition") return "Give the one-mark textbook definition as tightly as possible.";
    return "Answer in business language, then compare your wording with the mark scheme point.";
  }

  function buildPaperAnswer(item) {
    if (item.type === "mcq") {
      return `
        <div class="feedback-status">✅ Mark Scheme</div>
        <div class="feedback-divider"></div>
        <div class="feedback-body"><strong>${escapeHtml(item.answer_letter)}.</strong> ${escapeHtml(item.correct_option || item.answer_text)}</div>
      `;
    }
    if (item.type === "calculation") {
      return `
        <div class="feedback-status">🧮 Working + Answer</div>
        <div class="feedback-divider"></div>
        <div class="feedback-body">${escapeHtml(item.working || "No working captured.")}</div>
        <div class="chips" style="margin-top: 1rem;">
          <span class="chip">Answer: ${escapeHtml(item.answer_text || "See mark scheme")}</span>
        </div>
      `;
    }
    return `
      <div class="feedback-status">📝 Mark Scheme</div>
      <div class="feedback-divider"></div>
      <div class="feedback-body">${escapeHtml(item.mark_scheme || "See the original paper for the full answer.")}</div>
    `;
  }

  function renderPaperDrill() {
    const meta = byId("paperDrillMeta");
    const prompt = byId("paperDrillPrompt");
    const hint = byId("paperDrillHint");
    const typeChip = byId("paperDrillTypeChip");
    const markChip = byId("paperDrillMarksChip");
    const indexChip = byId("paperDrillIndexChip");
    const options = byId("paperDrillOptions");
    const typedWrap = byId("paperDrillTypedWrap");
    const typedAnswer = byId("paperDrillAnswer");
    const feedback = byId("paperDrillFeedback");
    if (!meta || !prompt || !hint || !typeChip || !markChip || !indexChip || !options || !typedWrap || !typedAnswer || !feedback) return;

    if (!state.paperQueue.length) {
      meta.textContent = "Paper Drill";
      prompt.textContent = "No drills match this filter";
      hint.textContent = "Switch the drill type or regenerate the study data if the uploaded papers changed.";
      typeChip.textContent = "Empty";
      markChip.textContent = "0 marks";
      indexChip.textContent = "0 / 0";
      options.innerHTML = "";
      typedWrap.classList.add("hidden");
      feedback.className = "feedback";
      feedback.innerHTML = `<div class="feedback-status">Waiting for drill data</div><div class="feedback-body">This panel fills with extracted mark-scheme questions from the uploaded papers.</div>`;
      return;
    }

    const item = state.paperQueue[state.paperIndex];
    meta.textContent = item.source;
    prompt.textContent = item.prompt;
    hint.textContent = getPaperHint(item);
    typeChip.textContent = item.type.replace("_", " ");
    markChip.textContent = `${item.marks} mark${item.marks === 1 ? "" : "s"}`;
    indexChip.textContent = `${state.paperIndex + 1} / ${state.paperQueue.length}`;
    feedback.className = "feedback";
    feedback.innerHTML = `
      <div class="feedback-status">Attempt First</div>
      <div class="feedback-divider"></div>
      <div class="feedback-body">Reveal the answer only after you have committed to a response.</div>
    `;
    state.paperAnswered = false;

    if (item.type === "mcq") {
      typedWrap.classList.add("hidden");
      options.innerHTML = "";
      (item.options || []).forEach((optionText, index) => {
        const button = document.createElement("button");
        button.className = "option";
        button.type = "button";
        button.innerHTML = `<strong>${String.fromCharCode(65 + index)}.</strong> ${escapeHtml(optionText)}`;
        button.addEventListener("click", () => answerPaperMcq(button, item, index));
        options.appendChild(button);
      });
      return;
    }

    options.innerHTML = "";
    typedWrap.classList.remove("hidden");
    typedAnswer.value = "";
  }

  function answerPaperMcq(button, item, index) {
    if (state.paperAnswered) return;
    state.paperAnswered = true;

    const options = byId("paperDrillOptions");
    const feedback = byId("paperDrillFeedback");
    if (!options || !feedback) return;

    const correctIndex = ord(item.answer_letter) - ord("A");
    [...options.querySelectorAll(".option")].forEach((node, nodeIndex) => {
      if (nodeIndex === correctIndex) node.classList.add("correct");
      if (nodeIndex === index && nodeIndex !== correctIndex) node.classList.add("wrong");
    });

    feedback.className = index === correctIndex ? "feedback good" : "feedback bad";
    feedback.innerHTML = buildPaperAnswer(item);
  }

  function ord(letter) {
    return String(letter || "A").toUpperCase().charCodeAt(0);
  }

  function revealPaperAnswer() {
    if (!state.paperQueue.length) return;
    const item = state.paperQueue[state.paperIndex];
    const feedback = byId("paperDrillFeedback");
    if (!feedback) return;

    state.paperAnswered = true;
    feedback.className = "feedback";
    feedback.innerHTML = buildPaperAnswer(item);
  }

  function nextPaperDrill() {
    if (!state.paperQueue.length) return;
    state.paperIndex = (state.paperIndex + 1) % state.paperQueue.length;
    renderPaperDrill();
  }

  function renderPlaybook() {
    const container = byId("examinerPlaybookList");
    if (!container) return;
    container.innerHTML = "";
    data.examinerPlaybook.forEach((item) => {
      const card = document.createElement("article");
      card.className = "playbook-card";
      card.innerHTML = `
        <div class="mini">${escapeHtml(item.title)}</div>
        <p>${escapeHtml(item.body)}</p>
      `;
      container.appendChild(card);
    });
  }

  function renderPaperVault() {
    const container = byId("paperVaultList");
    if (!container) return;
    container.innerHTML = "";
    data.paperCollections.forEach((item) => {
      const card = document.createElement("article");
      card.className = "vault-card";
      const assets = (item.assets || [])
        .map(
          (asset) =>
            `<a class="pill vault-link" href="${encodeURI(asset.url)}" target="_blank" rel="noopener">${escapeHtml(asset.label)}</a>`
        )
        .join("");
      card.innerHTML = `
        <div class="mini">${escapeHtml(item.subtitle || item.paper_code || "Revision resource")}</div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="vault-assets">${assets}</div>
      `;
      container.appendChild(card);
    });
  }

  function initialiseButtons() {
    const formulaReveal = byId("revealFormulaBtn");
    const formulaNext = byId("nextFormulaBtn");
    const formulaShuffle = byId("shuffleFormulasBtn");
    const paperReveal = byId("showPaperAnswerBtn");
    const paperNext = byId("nextPaperDrillBtn");
    const paperShuffle = byId("shufflePaperDrillsBtn");
    const paperFilter = byId("paperDrillFilter");

    if (formulaReveal) formulaReveal.addEventListener("click", showFormulaAnswer);
    if (formulaNext) formulaNext.addEventListener("click", nextFormula);
    if (formulaShuffle) formulaShuffle.addEventListener("click", shuffleFormulas);
    if (paperReveal) paperReveal.addEventListener("click", revealPaperAnswer);
    if (paperNext) paperNext.addEventListener("click", nextPaperDrill);
    if (paperShuffle) paperShuffle.addEventListener("click", applyPaperFilter);
    if (paperFilter) {
      paperFilter.addEventListener("change", () => {
        state.paperFilter = paperFilter.value;
        applyPaperFilter();
      });
    }
  }

  function init() {
    initialiseStats();
    initialiseStudyTabs();
    initialiseButtons();
    state.paperQueue = getPaperQueue();
    renderFormulaCard();
    renderPaperDrill();
    renderPlaybook();
    renderPaperVault();
    showStudyView("formula");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
