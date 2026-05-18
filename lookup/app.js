(function () {
  const form = document.getElementById("form");
  const input = document.getElementById("q");
  const meta = document.getElementById("meta");
  const results = document.getElementById("results");
  const tagFilterWrap = document.getElementById("tag-filter-wrap");
  const tagFilterToggle = document.getElementById("tag-filter-toggle");
  const tagFilterMenu = document.getElementById("tag-filter-menu");
  const tagFilterQuery = document.getElementById("tag-filter-q");
  const tagFilterList = document.getElementById("tag-filter-list");
  const tagFilterEmpty = document.getElementById("tag-filter-empty");
  const tagFilterClear = document.getElementById("tag-filter-clear");

  const index = window.LEAFLET_INDEX;
  if (!index?.leaflets) {
    results.innerHTML =
      '<p class="error">Product index not loaded. Run <code>python3 scripts/index-leaflets.py</code> from the repo root, then reload this page.</p>';
    return;
  }

  const catalog = buildCatalog(index);
  const allTags = collectTags(catalog);
  const selectedTags = new Set();

  initTagFilters();
  updateMeta(catalog.length, "indexed");

  function buildCatalog(idx) {
    const rows = [];
    for (const leaflet of idx.leaflets) {
      const tags = leaflet.tags ?? [];
      const pathParts = [...tags, leaflet.file];
      const pdfHref = `../leaflets/${pathParts.map((p) => encodeURIComponent(p)).join("/")}#page=`;
      for (const item of leaflet.items ?? []) {
        rows.push({
          name: item.name,
          price: item.price,
          page: item.page,
          leaflet: leaflet.file,
          tags,
          pdfHref: `${pdfHref}${item.page}`,
          searchText: `${item.name} ${item.price} ${tags.join(" ")}`.toLowerCase(),
        });
      }
    }
    return rows;
  }

  function collectTags(rows) {
    const tags = new Set();
    for (const row of rows) {
      for (const tag of row.tags) tags.add(tag);
    }
    return [...tags].sort((a, b) => a.localeCompare(b));
  }

  function initTagFilters() {
    if (allTags.length === 0) return;

    tagFilterWrap.hidden = false;
    tagFilterList.innerHTML = allTags
      .map(
        (tag) => `
        <label class="tag-option" data-tag="${escapeHtml(tag)}">
          <input type="checkbox" value="${escapeHtml(tag)}" />
          <span>${escapeHtml(tag)}</span>
        </label>`,
      )
      .join("");

    tagFilterList.addEventListener("change", (e) => {
      const input = e.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked) selectedTags.add(input.value);
      else selectedTags.delete(input.value);
      updateTagFilterUi();
      syncTagParams();
      refresh();
    });

    tagFilterToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setTagMenuOpen(!isTagMenuOpen());
    });

    tagFilterMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    tagFilterQuery.addEventListener("input", () => {
      filterTagList(tagFilterQuery.value);
    });

    tagFilterQuery.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
    });

    tagFilterClear.addEventListener("click", () => {
      selectedTags.clear();
      updateTagFilterUi();
      syncTagParams();
      refresh();
    });

    document.addEventListener("click", () => {
      if (isTagMenuOpen()) setTagMenuOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isTagMenuOpen()) setTagMenuOpen(false);
    });

    const params = new URLSearchParams(location.search);
    for (const tag of params.getAll("tag")) {
      if (!allTags.includes(tag)) continue;
      selectedTags.add(tag);
    }
    updateTagFilterUi();
  }

  function isTagMenuOpen() {
    return tagFilterMenu.classList.contains("is-open");
  }

  function filterTagList(query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    for (const label of tagFilterList.querySelectorAll(".tag-option")) {
      const tag = label.dataset.tag ?? "";
      const match = !q || tag.includes(q);
      label.classList.toggle("is-filtered-out", !match);
      if (match) visible += 1;
    }
    tagFilterEmpty.hidden = visible > 0 || !q;
  }

  function setTagMenuOpen(open) {
    tagFilterMenu.classList.toggle("is-open", open);
    tagFilterToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      tagFilterQuery.value = "";
      filterTagList("");
      tagFilterQuery.focus();
    }
  }

  function updateTagFilterUi() {
    for (const input of tagFilterList.querySelectorAll('input[type="checkbox"]')) {
      input.checked = selectedTags.has(input.value);
    }
    const count = selectedTags.size;
    tagFilterClear.hidden = count === 0;
    tagFilterToggle.classList.toggle("has-filter", count > 0);
    if (count === 0) {
      tagFilterToggle.textContent = "Tags";
      return;
    }
    if (count === 1) {
      tagFilterToggle.textContent = `Tags · ${[...selectedTags][0]}`;
      return;
    }
    tagFilterToggle.textContent = `Tags · ${count}`;
  }

  function syncTagParams() {
    const params = new URLSearchParams(location.search);
    params.delete("tag");
    for (const tag of [...selectedTags].sort()) params.append("tag", tag);
    const q = input.value.trim();
    if (q) params.set("q", q);
    else params.delete("q");
    const next = params.toString();
    const url = next ? `${location.pathname}?${next}` : location.pathname;
    history.replaceState(null, "", url);
  }

  function matchesTags(row) {
    if (selectedTags.size === 0) return true;
    return [...selectedTags].every((tag) => row.tags.includes(tag));
  }

  function search(query) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return [];
    return catalog.filter(
      (row) => matchesTags(row) && terms.every((term) => row.searchText.includes(term)),
    );
  }

  function renderTags(tags) {
    if (!tags?.length) return "";
    return `<p class="tags">${tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</p>`;
  }

  function render(matches, query) {
    if (!query.trim()) {
      results.innerHTML = "";
      return;
    }

    if (matches.length === 0) {
      const tagHint =
        selectedTags.size > 0
          ? ` (tags: ${[...selectedTags].map(escapeHtml).join(", ")})`
          : "";
      results.innerHTML = `<p class="empty">No products matched “${escapeHtml(query)}”${tagHint}.</p>`;
      return;
    }

    results.innerHTML = matches
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 80)
      .map(
        (item) => `
        <article class="result">
          <h2>${escapeHtml(item.name)}</h2>
          <p class="price">${escapeHtml(item.price)}</p>
          ${renderTags(item.tags)}
          <p class="leaflet">${escapeHtml(item.leaflet)} · page ${item.page}</p>
          <a href="${escapeHtml(item.pdfHref)}" target="_blank" rel="noopener noreferrer">Open page ${item.page} in PDF</a>
        </article>
      `,
      )
      .join("");
  }

  function updateMeta(count, mode) {
    const tagSuffix =
      selectedTags.size > 0 ? ` · tags: ${[...selectedTags].sort().join(", ")}` : "";
    if (mode === "indexed" || mode === "filtered") {
      const label = mode === "filtered" ? "products (tag filter)" : "products";
      meta.textContent = index.indexedAt
        ? `${count} ${label} · index ${formatDate(index.indexedAt)}${tagSuffix}`
        : `${count} ${label} indexed${tagSuffix}`;
      return;
    }
    const shown = Math.min(count, 80);
    let text = index.indexedAt
      ? `${count} match(es) · index ${formatDate(index.indexedAt)}`
      : `${count} match(es)`;
    if (count > 80) text += ` (showing first ${shown})`;
    meta.textContent = text + tagSuffix;
  }

  function refresh() {
    const q = input.value.trim();
    if (q) {
      runSearch(q);
      return;
    }
    const count =
      selectedTags.size > 0 ? catalog.filter(matchesTags).length : catalog.length;
    updateMeta(count, selectedTags.size > 0 ? "filtered" : "indexed");
    results.innerHTML = "";
    syncTagParams();
  }

  function runSearch(query) {
    const q = query.trim();
    const matches = search(q);
    updateMeta(matches.length, "search");
    syncTagParams();
    render(matches, q);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    refresh();
  });

  input.addEventListener(
    "input",
    debounce(() => {
      if (input.value.trim().length >= 2) runSearch(input.value);
    }, 200),
  );

  const params = new URLSearchParams(location.search);
  if (params.get("q")) {
    input.value = params.get("q");
    runSearch(input.value);
  }
})();
