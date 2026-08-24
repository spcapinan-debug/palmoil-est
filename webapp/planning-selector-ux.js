(() => {
  "use strict";

  const selectorRoot = ".farm-work-budget-selector[data-budget-context=\"work-plan\"]";
  const selectorMeta = [
    { type: "block", label: "พื้นที่" },
    { type: "activity", label: "กิจกรรม" },
    { type: "material", label: "วัสดุ" },
    { type: "vehicle", label: "รถ/เครื่องจักร" },
    { type: "worker", label: "พนักงาน" },
  ];
  const searchTerms = new Map();
  let bulkJob = null;
  let bulkTimer = 0;

  function normalize(value = "") {
    return String(value).trim().toLocaleLowerCase("th");
  }

  function isVisible(node) {
    return Boolean(node && !node.hidden && !node.closest("[hidden]"));
  }

  function leafInputs(card) {
    return [...card.querySelectorAll("input[data-budget-pick]")].filter((input) => {
      if (input.dataset.budgetBlockGroup) return false;
      return !(input.dataset.budgetPick === "worker" && String(input.value).startsWith("team:"));
    });
  }

  function selectedCount(card) {
    return leafInputs(card).filter((input) => input.checked).length;
  }

  function setSelectedHighlights(card) {
    card.querySelectorAll(".budget-tree-item, .budget-team-summary").forEach((row) => {
      const input = row.querySelector(":scope > input[data-budget-pick]");
      row.classList.toggle("is-selected", Boolean(input?.checked));
    });
  }

  function updateSummary(root) {
    const counts = new Map();
    root.querySelectorAll(":scope > .budget-tree-card").forEach((card) => {
      const type = card.dataset.planningUxType;
      const count = selectedCount(card);
      counts.set(type, count);
      const badge = card.querySelector("[data-planning-selected-count]");
      if (badge) badge.textContent = "เลือกแล้ว " + count;
      setSelectedHighlights(card);
      const selectAll = card.querySelector("[data-planning-select-all]");
      if (selectAll) selectAll.disabled = !leafInputs(card).some((input) => isVisible(input) && !input.checked);
      const clearAll = card.querySelector("[data-planning-clear-all]");
      if (clearAll) clearAll.disabled = count === 0;
    });
    const strip = root.previousElementSibling?.matches(".farm-plan-selected-summary-strip")
      ? root.previousElementSibling : null;
    if (!strip) return;
    selectorMeta.forEach(({ type }) => {
      const count = strip.querySelector("[data-planning-summary-count=\"" + type + "\"]");
      if (count) count.textContent = String(counts.get(type) || 0);
    });
  }

  function setDescendantsVisible(details) {
    details.querySelectorAll("details, .budget-tree-item").forEach((node) => {
      node.hidden = false;
    });
  }

  function filterCard(card, rawQuery) {
    const query = normalize(rawQuery);
    searchTerms.set(card.dataset.planningUxType, rawQuery);
    const items = [...card.querySelectorAll(".budget-tree-item")];
    const details = [...card.querySelectorAll("details")];
    items.forEach((item) => {
      item.hidden = Boolean(query && !normalize(item.textContent).includes(query));
    });
    details.reverse().forEach((branch) => {
      const summary = branch.querySelector(":scope > summary");
      const summaryMatches = Boolean(query && normalize(summary?.textContent).includes(query));
      if (summaryMatches) setDescendantsVisible(branch);
      const hasMatch = summaryMatches
        || Boolean(branch.querySelector(".budget-tree-item:not([hidden]), details:not([hidden])"));
      branch.hidden = Boolean(query && !hasMatch);
      if (query && hasMatch) branch.open = true;
    });
    const empty = card.querySelector("[data-planning-search-empty]");
    if (empty) {
      const hasVisibleChoice = [...card.querySelectorAll("input[data-budget-pick]")].some(isVisible);
      empty.hidden = !query || hasVisibleChoice;
    }
    const selectAll = card.querySelector("[data-planning-select-all]");
    if (selectAll) {
      selectAll.disabled = ![...card.querySelectorAll("input[data-budget-pick]")]
        .some((input) => isVisible(input) && !input.checked);
      selectAll.title = query ? "เลือกผลการค้นหาทั้งหมด" : "เลือกทั้งหมดในรายการนี้";
    }
    const clearAll = card.querySelector("[data-planning-clear-all]");
    if (clearAll) clearAll.disabled = ![...card.querySelectorAll("input[data-budget-pick]")].some((input) => input.checked);
  }

  function queueBulk(card, checked) {
    const inputs = [...card.querySelectorAll("input[data-budget-pick]")]
      .filter((input) => checked ? isVisible(input) : input.checked);
    bulkJob = {
      checked,
      misses: 0,
      type: card.dataset.planningUxType,
      values: [...new Set(inputs.map((input) => String(input.value)))],
    };
    processBulk();
  }

  function scheduleBulk() {
    window.clearTimeout(bulkTimer);
    bulkTimer = window.setTimeout(processBulk, 0);
  }

  function processBulk() {
    if (!bulkJob) return;
    const root = document.querySelector(selectorRoot);
    const card = root?.querySelector("[data-planning-ux-type=\"" + bulkJob.type + "\"]");
    if (!card) {
      bulkJob.misses += 1;
      if (bulkJob.misses > 20) bulkJob = null;
      else scheduleBulk();
      return;
    }
    while (bulkJob.values.length) {
      const value = bulkJob.values.shift();
      const input = [...card.querySelectorAll("input[data-budget-pick=\"" + bulkJob.type + "\"]")]
        .find((candidate) => String(candidate.value) === value);
      if (!input || input.checked === bulkJob.checked) continue;
      input.checked = bulkJob.checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      scheduleBulk();
      return;
    }
    const type = bulkJob.type;
    bulkJob = null;
    updateSummary(root);
    root.querySelector("[data-planning-ux-type=\"" + type + "\"] [data-planning-search]")?.focus();
  }

  function makeSummaryStrip(root) {
    if (root.previousElementSibling?.matches(".farm-plan-selected-summary-strip")) return;
    const strip = document.createElement("div");
    strip.className = "farm-plan-selected-summary-strip";
    strip.setAttribute("aria-label", "สรุปรายการที่เลือก");
    strip.setAttribute("aria-live", "polite");
    strip.innerHTML = '<span class="farm-plan-selected-summary-label">Selected summary</span>'
      + selectorMeta.map(({ type, label }) => '<span>' + label
        + ' <strong data-planning-summary-count="' + type + '">0</strong></span>').join("");
    root.before(strip);
  }

  function decorateCard(card, meta) {
    if (card.dataset.planningUxReady === "true") return;
    card.dataset.planningUxReady = "true";
    card.dataset.planningUxType = meta.type;
    const tools = document.createElement("div");
    tools.className = "farm-plan-selector-tools";
    tools.innerHTML = [
      '<label class="farm-plan-selector-search">',
      '<span class="sr-only">ค้นหา' + meta.label + '</span>',
      '<input type="search" data-planning-search placeholder="ค้นหา' + meta.label + '" autocomplete="off">',
      '</label>',
      '<div class="farm-plan-selector-actions">',
      '<button type="button" data-planning-select-all>เลือกทั้งหมด</button>',
      '<button type="button" data-planning-clear-all>ล้างทั้งหมด</button>',
      '</div>',
      '<span class="farm-plan-selector-count" data-planning-selected-count>เลือกแล้ว 0</span>',
    ].join("");
    const empty = document.createElement("div");
    empty.className = "farm-selector-search-empty";
    empty.dataset.planningSearchEmpty = "true";
    empty.textContent = "ไม่พบรายการที่ค้นหา";
    empty.hidden = true;
    const scroll = card.querySelector(":scope > .budget-tree-scroll");
    card.querySelector(":scope > h4")?.after(tools);
    scroll?.append(empty);

    const search = tools.querySelector("[data-planning-search]");
    search.value = searchTerms.get(meta.type) || "";
    search.addEventListener("input", () => filterCard(card, search.value));
    tools.querySelector("[data-planning-select-all]").addEventListener("click", () => queueBulk(card, true));
    tools.querySelector("[data-planning-clear-all]").addEventListener("click", () => queueBulk(card, false));
    filterCard(card, search.value);
  }

  function enhance(root) {
    makeSummaryStrip(root);
    root.querySelectorAll(":scope > .budget-tree-card").forEach((card, index) => {
      decorateCard(card, selectorMeta[index] || { type: "selector-" + index, label: "รายการ" });
    });
    updateSummary(root);
    if (bulkJob) scheduleBulk();
  }

  function scan() {
    document.querySelectorAll(selectorRoot + ":not([data-planning-ux-ready])").forEach((root) => {
      root.dataset.planningUxReady = "true";
      enhance(root);
    });
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
