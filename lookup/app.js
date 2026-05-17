(function () {
  const form = document.getElementById("form");
  const input = document.getElementById("q");
  const meta = document.getElementById("meta");
  const results = document.getElementById("results");

  const index = window.LEAFLET_INDEX;
  if (!index?.leaflets) {
    results.innerHTML =
      '<p class="error">Product index not loaded. Run <code>python3 scripts/index-leaflets.py</code> from the repo root, then reload this page.</p>';
    return;
  }

  const catalog = buildCatalog(index);

  meta.textContent = index.indexedAt
    ? `${catalog.length} products · index ${formatDate(index.indexedAt)}`
    : `${catalog.length} products indexed`;

  function buildCatalog(idx) {
    const rows = [];
    for (const leaflet of idx.leaflets) {
      for (const item of leaflet.items ?? []) {
        rows.push({
          name: item.name,
          price: item.price,
          page: item.page,
          leaflet: leaflet.file,
          pdfHref: `../leaflets/${encodeURIComponent(leaflet.file)}#page=${item.page}`,
          searchText: `${item.name} ${item.price}`.toLowerCase(),
        });
      }
    }
    return rows;
  }

  function search(query) {
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (terms.length === 0) return [];
    return catalog.filter((row) => terms.every((term) => row.searchText.includes(term)));
  }

  function render(matches, query) {
    if (!query.trim()) {
      results.innerHTML = "";
      return;
    }

    if (matches.length === 0) {
      results.innerHTML = `<p class="empty">No products matched “${escapeHtml(query)}”.</p>`;
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
          <p class="leaflet">${escapeHtml(item.leaflet)} · page ${item.page}</p>
          <a href="${escapeHtml(item.pdfHref)}">Open page ${item.page} in PDF</a>
        </article>
      `,
      )
      .join("");
  }

  function runSearch(query) {
    const q = query.trim();
    const matches = search(q);
    const shown = Math.min(matches.length, 80);
    meta.textContent = index.indexedAt
      ? `${matches.length} match(es) · index ${formatDate(index.indexedAt)}`
      : `${matches.length} match(es)`;
    if (matches.length > 80) {
      meta.textContent += ` (showing first 80)`;
    }
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
    runSearch(input.value);
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
