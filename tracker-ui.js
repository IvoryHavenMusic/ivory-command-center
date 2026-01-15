// tracker-ui.js (classic script; attaches window.initTrackerUI)
//
// KEEPING EVERYTHING YOU ALREADY HAVE, PLUS:
// - Tracker sub-views: Scheduled (default) | Live
// - Uses DB views if present: v_scheduled / v_live
// - Falls back to table filter if views aren't ready yet
// - Adds Status dropdown column (scheduled/live) that updates DB safely
//
// Notes on compatibility:
// - Prefers column "status" (new model)
// - If not present, falls back to "streaming" or "streaming_status" if those exist
//   so nothing breaks during transition.

(function () {
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function fmtDate(d) {
    if (!d) return "";
    try { return String(d).slice(0, 10); } catch { return ""; }
  }

  function safe(s) {
    return (s == null) ? "" : String(s);
  }

  async function requireSupabase() {
    const sb = window.supabaseClient;
    if (!sb) throw new Error("Missing window.supabaseClient. supabase.js must set it.");
    return sb;
  }

  function injectUiStyles() {
    if (document.getElementById("trackerUiStyles")) return;
    const css = `
      .cc-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;}
      .cc-chip{border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);padding:8px 10px;border-radius:999px;font-size:12px;color:rgba(255,255,255,0.78)}
      .cc-input,.cc-select,.cc-textarea{border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.92);padding:10px 12px;border-radius:12px;font-size:13px;min-width:160px}
      .cc-textarea{min-width:220px;min-height:38px;resize:vertical}
      .cc-btn{appearance:none;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.92);padding:10px 12px;border-radius:12px;font-weight:700;cursor:pointer}
      .cc-btn:hover{background:rgba(255,255,255,0.18)}
      .cc-btn:disabled{opacity:.55;cursor:not-allowed}
      .cc-danger{border-color:rgba(255,93,93,0.35);background:rgba(255,93,93,0.12)}
      .cc-danger:hover{background:rgba(255,93,93,0.18)}
      .cc-tableWrap{overflow:auto;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:rgba(255,255,255,0.04)}
      table.cc-table{width:100%;border-collapse:separate;border-spacing:0}
      .cc-table th,.cc-table td{padding:10px 10px;border-bottom:1px solid rgba(255,255,255,0.10);font-size:12px;vertical-align:top}
      .cc-table th{position:sticky;top:0;background:rgba(12,16,22,0.92);backdrop-filter:blur(8px);text-align:left;color:rgba(255,255,255,0.82)}
      .cc-table tr:hover td{background:rgba(255,255,255,0.03)}
      .cc-muted{color:rgba(255,255,255,0.65)}
      .cc-ok{color:#40d67f;font-weight:800}
      .cc-warn{color:#ffb020;font-weight:800}
      .cc-err{color:#ff5d5d;font-weight:800}
      .cc-tabs{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
      .cc-tab{border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);padding:8px 10px;border-radius:12px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.82);user-select:none}
      .cc-tab.active{background:rgba(64,214,127,0.12);border-color:rgba(64,214,127,0.35)}
      .cc-tab.blue.active{background:rgba(0,153,255,0.12);border-color:rgba(0,153,255,0.35)}
      .cc-modalBack{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:14px;z-index:9999}
      .cc-modal{max-width:780px;width:100%;border:1px solid rgba(255,255,255,0.14);border-radius:16px;background:rgba(12,16,22,0.96);box-shadow:0 20px 80px rgba(0,0,0,0.6);padding:14px}
      .cc-modalHeader{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
      .cc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media (max-width:740px){.cc-grid{grid-template-columns:1fr}}
      .cc-note{font-size:12px;color:rgba(255,255,255,0.65);line-height:1.35;margin-top:6px}
      .cc-mini{font-size:11px;color:rgba(255,255,255,0.72)}
      .cc-actions{display:flex;gap:8px;flex-wrap:wrap}
      .cc-rowEdit{background:rgba(64,214,127,0.06)}
      .cc-inlineField{min-width:140px}
      .cc-inlineTiny{min-width:110px}
    `;
    const style = document.createElement("style");
    style.id = "trackerUiStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function showModal(title, bodyNode, onClose) {
    const back = el("div", { class: "cc-modalBack" });
    const modal = el("div", { class: "cc-modal" });

    const btnX = el("button", { class: "cc-btn", type: "button" }, ["Close"]);
    btnX.addEventListener("click", () => {
      back.remove();
      onClose && onClose();
    });

    modal.appendChild(
      el("div", { class: "cc-modalHeader" }, [
        el("div", {}, [el("strong", {}, [title])]),
        btnX
      ])
    );
    modal.appendChild(bodyNode);

    back.addEventListener("click", (e) => {
      if (e.target === back) btnX.click();
    });

    back.appendChild(modal);
    document.body.appendChild(back);
    return { close: () => btnX.click() };
  }

 async function loadSongs(sb) {
  // Only show backlog songs (unscheduled)
  const { data, error } = await sb
    .from("songs")
    .select("*")
    .or("stage.is.null,stage.eq.backlog")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

  // ===== NEW: tracker loader supports views + fallback =====
  async function loadTrackerByView(sb, viewName) {
  const { data, error } = await sb
    .from(viewName)
    .select("*")
    .order("release_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

  async function loadTrackerFallback(sb) {
    const { data, error } = await sb
      .from("music_tracker")
      .select("*")
      .order("release_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function uniq(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function confirmDanger(text) {
    return window.confirm(text);
  }

  // --- Delete / Update helpers ---
  async function deleteById(sb, table, id) {
    const { error } = await sb.from(table).delete().eq("id", id);
    if (error) throw error;
  }

  async function updateById(sb, table, id, patch) {
    const { error } = await sb.from(table).update(patch).eq("id", id);
    if (error) throw error;
  }

  async function countTrackerFromDate(sb, dateStr, includeNulls) {
    // inclusive: release_date >= dateStr
    let q = sb
      .from("music_tracker")
      .select("id", { count: "exact", head: true });

    q = q.gte("release_date", dateStr);

    const { count, error } = await q;
    if (error) throw error;

    if (!includeNulls) return count || 0;

    const { count: nullCount, error: e2 } = await sb
      .from("music_tracker")
      .select("id", { count: "exact", head: true })
      .is("release_date", null);

    if (e2) throw e2;
    return (count || 0) + (nullCount || 0);
  }

  async function bulkDeleteTrackerFromDate(sb, dateStr, includeNulls) {
    const { error } = await sb
      .from("music_tracker")
      .delete()
      .gte("release_date", dateStr);
    if (error) throw error;

    if (includeNulls) {
      const { error: e2 } = await sb
        .from("music_tracker")
        .delete()
        .is("release_date", null);
      if (e2) throw e2;
    }
  }

  // buildTable supports render columns for custom cell nodes
  function buildTable(columns, rows, rowClassFn) {
    const thead = el("thead", {}, [
      el("tr", {}, columns.map(c => el("th", {}, [c.label])))
    ]);

    const tbody = el("tbody");
    if (!rows.length) {
      tbody.appendChild(
        el("tr", {}, [el("td", { colspan: String(columns.length), class: "cc-muted" }, ["No rows yet."])])
      );
    } else {
      for (const r of rows) {
        const tds = columns.map(c => {
          if (typeof c.render === "function") return el("td", {}, [c.render(r)]);
          return el("td", {}, [safe(r[c.key])]);
        });
        const tr = el("tr", {}, tds);
        if (typeof rowClassFn === "function") {
          const cls = rowClassFn(r);
          if (cls) tr.classList.add(cls);
        }
        tbody.appendChild(tr);
      }
    }

    return el("div", { class: "cc-tableWrap" }, [
      el("table", { class: "cc-table" }, [thead, tbody])
    ]);
  }

  // ---- Dropdown dictionaries (lightweight, no schema change) ----
  const ARTISTS = ["Ivory Ocean", "Ivory Haven"];

  const TRACKER_CATEGORIES = [
    "", "Single", "EP", "Album", "Video", "Promo", "Remaster", "Other"
  ];

  // Existing workflow statuses (KEEPING THESE)
  const STREAMING_STATUS = [
    "", "Idea", "Demo", "Writing", "Recording", "Mixing", "Mastering", "Scheduled", "Released", "On Hold"
  ];

  const VIDEO_STATUS = [
    "", "None", "Planned", "In Progress", "Editing", "Scheduled", "Released"
  ];

  const YES_NO = ["", "Yes", "No"];

  const GENRES_PRIMARY = [
    "",
    "Tropical House",
    "Progressive House",
    "Future House",
    "Afrobeat / Tropical",
    "Tropical Fusion",
    "Pop",
    "Ballad",
    "80s / Retro",
    "Other"
  ];

  const FUSION_WITH = [
    "",
    "Reggaeton / Latin",
    "Caribbean / Dancehall",
    "Cuban",
    "Brazilian",
    "Afrobeat",
    "R&B / Soul",
    "Other"
  ];

  // ===== NEW: Status enum (the clean "Scheduled vs Live" view driver) =====
  const STATUS_VALUES = ["scheduled", "live"];

  function makeSelect(options, value, className) {
    const sel = el("select", { class: className || "cc-select" }, [
      ...options.map(o => el("option", { value: o }, [o || "—"]))
    ]);
    sel.value = value == null ? "" : String(value);
    return sel;
  }

  function makeInput(value, placeholder, className) {
    const inp = el("input", { class: className || "cc-input", placeholder: placeholder || "" });
    inp.value = value == null ? "" : String(value);
    return inp;
  }

  function makeDateInput(value, className) {
    const inp = el("input", { class: className || "cc-input", type: "date" });
    inp.value = fmtDate(value);
    return inp;
  }

  function makeTextarea(value, placeholder, className) {
    const ta = el("textarea", { class: className || "cc-textarea", placeholder: placeholder || "" });
    ta.value = value == null ? "" : String(value);
    return ta;
  }

  function cleanPatch(patch) {
    const out = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === "") out[k] = null;
      else out[k] = v;
    }
    return out;
  }

  // ===== NEW: determine which column to use for "Scheduled/Live" status =====
  function detectStatusColumn(sampleRow) {
    if (!sampleRow) return null;
    // Preferred new column
    if ("status" in sampleRow) return "status";
    // Transitional possibilities
    if ("streaming" in sampleRow) return "streaming";
    // Last-resort: if user had been using streaming_status to mean live/scheduled (not ideal, but safe)
    if ("streaming_status" in sampleRow) return "streaming_status";
    return null;
  }

  function normalizeStatusValue(v) {
    const s = safe(v).trim().toLowerCase();
    if (!s) return "";
    if (s === "released") return "live";
    if (s === "live") return "live";
    if (s === "scheduled") return "scheduled";
    return s;
  }

  function rowIsLive(row, statusCol) {
    if (!statusCol) return false;
    const v = normalizeStatusValue(row[statusCol]);
    if (v === "live") return true;

    // If we’re stuck using streaming_status (workflow), treat "Released" as live
    if (statusCol === "streaming_status" && safe(row.streaming_status).toLowerCase() === "released") return true;

    return false;
  }

  window.initTrackerUI = async function initTrackerUI({ rootId = "appRoot" } = {}) {
    injectUiStyles();

    const root = document.getElementById(rootId);
    if (!root) throw new Error("Missing #" + rootId);

    const sb = await requireSupabase();

    const statusLine = el("div", { class: "cc-note", id: "uiStatus" }, ["Loading…"]);

    const tabs = el("div", { class: "cc-tabs" }, []);
    const tabTracker = el("div", { class: "cc-tab active" }, ["Tracker"]);
    const tabBacklog = el("div", { class: "cc-tab" }, ["Backlog"]);
    tabs.appendChild(tabTracker);
    tabs.appendChild(tabBacklog);

    // ===== NEW: Tracker sub-tabs =====
    const trackerSubTabs = el("div", { class: "cc-tabs", style: "margin-top:10px" }, []);
    const tabScheduled = el("div", { class: "cc-tab blue active" }, ["Scheduled"]);
    const tabLive = el("div", { class: "cc-tab blue" }, ["Live"]);
    trackerSubTabs.appendChild(tabScheduled);
    trackerSubTabs.appendChild(tabLive);

    const toolbar = el("div", { class: "cc-toolbar" }, []);
    const content = el("div", { id: "uiContent" }, []);

    root.innerHTML = "";
    root.appendChild(tabs);
    root.appendChild(trackerSubTabs); // visible only when mode === tracker
    root.appendChild(toolbar);
    root.appendChild(content);
    root.appendChild(statusLine);

    let mode = "tracker";
    let trackerView = "scheduled"; // NEW: scheduled | live (default)
    let songsCache = [];
    let trackerCache = [];

    // Editing state
    let editing = { table: null, id: null };
    let draft = {};

    function setUiStatus(kind, msg) {
      const cls =
        kind === "ok" ? "cc-ok" :
        kind === "warn" ? "cc-warn" :
        kind === "err" ? "cc-err" : "cc-muted";
      statusLine.innerHTML = `<span class="${cls}">${msg}</span>`;
    }

    function setActiveTab() {
      tabTracker.classList.toggle("active", mode === "tracker");
      tabBacklog.classList.toggle("active", mode === "backlog");
      trackerSubTabs.style.display = (mode === "tracker") ? "" : "none";
    }

    function setActiveTrackerSubTab() {
      tabScheduled.classList.toggle("active", trackerView === "scheduled");
      tabLive.classList.toggle("active", trackerView === "live");
    }

    // ===== NEW: Load tracker using views if available =====
    async function loadTrackerSmart() {
      // Try views first. If they fail (missing view, permissions), fall back.
      const viewName = (trackerView === "live") ? "v_live" : "v_scheduled";
      try {
        const data = await loadTrackerByView(sb, viewName);
        return data;
      } catch (e) {
        // fallback to base table
        const all = await loadTrackerFallback(sb);
        // Filter client-side using whichever status column exists
        const statusCol = detectStatusColumn(all[0]);
        if (!statusCol) {
          // If no status column exists yet, scheduled view becomes "everything" (safe)
          return all;
        }
        if (trackerView === "live") {
          return all.filter(r => rowIsLive(r, statusCol));
        } else {
          return all.filter(r => !rowIsLive(r, statusCol));
        }
      }
    }

    async function refreshData() {
      setUiStatus("warn", "Refreshing data…");
      try {
        const songsPromise = loadSongs(sb);
        const trackerPromise = loadTrackerSmart();
        [songsCache, trackerCache] = await Promise.all([songsPromise, trackerPromise]);

        setUiStatus("ok", `Loaded ${trackerCache.length} tracker rows (${trackerView}) and ${songsCache.length} songs.`);
      } catch (e) {
        console.error(e);
        setUiStatus("err", "Load failed: " + (e?.message || String(e)));
      }
    }

    function resetEdit() {
      editing = { table: null, id: null };
      draft = {};
    }

    function beginEdit(table, row) {
      editing = { table, id: row.id };
      draft = { ...row };
    }

    function isEditingRow(table, row) {
      return editing.table === table && editing.id != null && String(editing.id) === String(row.id);
    }

    function render() {
      toolbar.innerHTML = "";
      content.innerHTML = "";
      setActiveTab();
      setActiveTrackerSubTab();

      const btnRefresh = el("button", { class: "cc-btn", type: "button" }, ["Refresh"]);
      btnRefresh.addEventListener("click", async () => {
        resetEdit();
        await refreshData();
        render();
      });

      const artistOptions =
        mode === "tracker"
          ? uniq(trackerCache.map(r => r.artist))
          : uniq(songsCache.map(r => r.artist));

      const selArtist = el("select", { class: "cc-select" }, [
        el("option", { value: "" }, ["All artists"]),
        ...artistOptions.map(a => el("option", { value: a }, [a]))
      ]);

      const qSearch = el("input", { class: "cc-input", placeholder: "Search title / notes…" });

      toolbar.appendChild(el("span", { class: "cc-chip" }, [mode === "tracker" ? `Tracker (${trackerView})` : "Backlog view"]));
      toolbar.appendChild(selArtist);
      toolbar.appendChild(qSearch);
      toolbar.appendChild(btnRefresh);

      // --- Tracker view ---
      if (mode === "tracker") {
        const btnPull = el("button", { class: "cc-btn", type: "button" }, ["Add from Backlog → Tracker"]);
        const btnNewSong = el("button", { class: "cc-btn", type: "button" }, ["Add New Song (Backlog)"]);
        btnNewSong.addEventListener("click", () => openAddSongModal());
        btnPull.addEventListener("click", () => openPullToTrackerModal());
        toolbar.appendChild(btnPull);
        toolbar.appendChild(btnNewSong);

        // Bulk delete FROM date onward (inclusive), with preview
        // (Available in tracker mode; applies to music_tracker table)
        const bulkDate = el("input", { class: "cc-input", type: "date" });
        const chkNulls = el("input", { type: "checkbox" });
        const lblNulls = el("label", { class: "cc-mini" }, [
          chkNulls, " Also delete rows with no release date"
        ]);
        lblNulls.style.display = "flex";
        lblNulls.style.gap = "8px";
        lblNulls.style.alignItems = "center";

        const btnPreview = el("button", { class: "cc-btn", type: "button" }, ["Preview delete count"]);
        const btnBulkDelete = el("button", { class: "cc-btn cc-danger", type: "button" }, ["Delete tracker rows from date onward"]);

        btnPreview.addEventListener("click", async () => {
          const d = bulkDate.value;
          if (!d) { setUiStatus("err", "Pick a date first for bulk delete preview."); return; }
          try {
            setUiStatus("warn", "Calculating…");
            const n = await countTrackerFromDate(sb, d, chkNulls.checked);
            setUiStatus("ok", `Bulk delete preview: ${n} tracker rows would be deleted from ${d} onward${chkNulls.checked ? " (including null dates)" : ""}.`);
          } catch (e) {
            console.error(e);
            setUiStatus("err", "Preview failed: " + (e?.message || String(e)));
          }
        });

        btnBulkDelete.addEventListener("click", async () => {
          const d = bulkDate.value;
          if (!d) { setUiStatus("err", "Pick a date first for bulk delete."); return; }

          try {
            setUiStatus("warn", "Calculating delete count…");
            const n = await countTrackerFromDate(sb, d, chkNulls.checked);

            const ok = confirmDanger(
              `Delete ${n} tracker row(s) FROM ${d} onward (inclusive)?\n\n` +
              `This cannot be undone.\n` +
              (chkNulls.checked ? `\nAlso includes rows with no release date.` : "")
            );
            if (!ok) return;

            resetEdit();
            setUiStatus("warn", "Bulk deleting…");
            await bulkDeleteTrackerFromDate(sb, d, chkNulls.checked);
            await refreshData();
            render();
            setUiStatus("ok", `Deleted ${n} tracker row(s) from ${d} onward.`);
          } catch (e) {
            console.error(e);
            setUiStatus("err", "Bulk delete failed: " + (e?.message || String(e)));
          }
        });

        toolbar.appendChild(el("span", { class: "cc-chip" }, ["Bulk cleanup"]));
        toolbar.appendChild(bulkDate);
        toolbar.appendChild(lblNulls);
        toolbar.appendChild(btnPreview);
        toolbar.appendChild(btnBulkDelete);

        function applyFilters(rows) {
          const a = selArtist.value;
          const q = qSearch.value.trim().toLowerCase();
          return rows
            .filter(r => {
              if (a && safe(r.artist) !== a) return false;
              if (!q) return true;
              const hay = (
                safe(r.song_title) + " " +
                safe(r.notes) + " " +
                safe(r.genre) + " " +
                safe(r.streaming_status) + " " +
                safe(r.video_status) + " " +
                safe(r.status) + " " +
                safe(r.streaming)
              ).toLowerCase();
              return hay.includes(q);
            })
            .map(r => ({ ...r, release_date: fmtDate(r.release_date) }));
        }

        function trackerCell(r, key, node) {
          if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r[key])]);
          const commit = () => { draft[key] = node.value; };
          node.addEventListener("input", commit);
          node.addEventListener("change", commit);
          node.value = safe(draft[key]);
          return node;
        }

        function trackerGenreEditor(r) {
          if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.genre)]);

          const current = safe(draft.genre);
          let primary = current;
          let fusion = "";

          const m = current.match(/^(.+?)\s*\((.+)\)\s*$/);
          if (m) { primary = m[1]; fusion = m[2]; }

          const selPrimary = makeSelect(GENRES_PRIMARY, primary, "cc-select cc-inlineField");
          const selFusion = makeSelect(FUSION_WITH, fusion, "cc-select cc-inlineField");

          const wrap = el("div", { class: "cc-actions" }, [selPrimary, selFusion]);

          function updateGenre() {
            const p = selPrimary.value;
            const f = selFusion.value;
            const combined = (p === "Tropical Fusion" && f) ? `Tropical Fusion (${f})` : p;
            draft.genre = combined;
          }
          selPrimary.addEventListener("change", updateGenre);
          selFusion.addEventListener("change", updateGenre);
          updateGenre();

          const syncVis = () => {
            selFusion.style.display = (selPrimary.value === "Tropical Fusion") ? "" : "none";
          };
          selPrimary.addEventListener("change", syncVis);
          syncVis();

          return wrap;
        }

        // ===== NEW: Status editor (scheduled/live) =====
        function statusEditor(r) {
          const statusCol = detectStatusColumn(r);
          const current = statusCol ? normalizeStatusValue(r[statusCol]) : "";
          const displayVal = (current === "live" || current === "scheduled") ? current : "";

          if (!isEditingRow("music_tracker", r)) {
            return el("div", {}, [displayVal || ""]);
          }

          const sel = makeSelect(STATUS_VALUES, normalizeStatusValue(draft[statusCol] ?? displayVal), "cc-select cc-inlineTiny");
          sel.addEventListener("change", () => {
            const v = sel.value;
            if (statusCol) draft[statusCol] = v;
          });
          return sel;
        }

        const cols = [
          {
            key: "release_date",
            label: "Release date",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [fmtDate(r.release_date)]);
              const inp = makeDateInput(draft.release_date, "cc-input cc-inlineField");
              inp.addEventListener("change", () => { draft.release_date = inp.value || null; });
              return inp;
            }
          },
          {
            key: "artist",
            label: "Artist",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.artist)]);
              const sel = makeSelect(ARTISTS, draft.artist, "cc-select cc-inlineField");
              sel.addEventListener("change", () => { draft.artist = sel.value; });
              return sel;
            }
          },
          {
            key: "song_title",
            label: "Song title",
            render: (r) => trackerCell(r, "song_title", makeInput(draft.song_title, "Title", "cc-input cc-inlineField"))
          },
          {
            key: "category",
            label: "Category",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.category)]);
              const sel = makeSelect(TRACKER_CATEGORIES, draft.category, "cc-select cc-inlineField");
              sel.addEventListener("change", () => { draft.category = sel.value; });
              return sel;
            }
          },
          { label: "Genre", render: (r) => trackerGenreEditor(r) },

          // ===== NEW COLUMN =====
          { label: "Status", render: (r) => statusEditor(r) },

          {
            key: "version",
            label: "Version",
            render: (r) => trackerCell(r, "version", makeInput(draft.version, "v#", "cc-input cc-inlineTiny"))
          },
          {
            key: "bpm",
            label: "BPM",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.bpm)]);
              const inp = makeInput(draft.bpm, "BPM", "cc-input cc-inlineTiny");
              inp.inputMode = "numeric";
              inp.addEventListener("input", () => {
                const v = inp.value.trim();
                draft.bpm = v ? Number(v) : null;
              });
              return inp;
            }
          },
          {
            key: "streaming_status",
            label: "Streaming",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.streaming_status)]);
              const sel = makeSelect(STREAMING_STATUS, draft.streaming_status, "cc-select cc-inlineField");
              sel.addEventListener("change", () => { draft.streaming_status = sel.value; });
              return sel;
            }
          },
          {
            key: "video_status",
            label: "Video",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.video_status)]);
              const sel = makeSelect(VIDEO_STATUS, draft.video_status, "cc-select cc-inlineField");
              sel.addEventListener("change", () => { draft.video_status = sel.value; });
              return sel;
            }
          },
          {
            key: "demo_preference",
            label: "Demo pref",
            render: (r) => trackerCell(r, "demo_preference", makeInput(draft.demo_preference, "", "cc-input cc-inlineField"))
          },
          {
            key: "pitch_by",
            label: "Pitch by",
            render: (r) => trackerCell(r, "pitch_by", makeInput(draft.pitch_by, "", "cc-input cc-inlineField"))
          },
          {
            key: "remaster_needed",
            label: "Remaster?",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.remaster_needed)]);
              const sel = makeSelect(YES_NO, safe(draft.remaster_needed), "cc-select cc-inlineTiny");
              sel.addEventListener("change", () => { draft.remaster_needed = sel.value; });
              return sel;
            }
          },
          {
            key: "notes",
            label: "Notes",
            render: (r) => {
              if (!isEditingRow("music_tracker", r)) return el("div", {}, [safe(r.notes)]);
              const ta = makeTextarea(draft.notes, "Notes…", "cc-textarea");
              ta.addEventListener("input", () => { draft.notes = ta.value; });
              return ta;
            }
          },
          {
            label: "Actions",
            render: (r) => {
              const wrap = el("div", { class: "cc-actions" }, []);

              const isEdit = isEditingRow("music_tracker", r);

              const btnEdit = el("button", { class: "cc-btn", type: "button" }, [isEdit ? "Editing…" : "Edit"]);
              btnEdit.disabled = isEdit;
              btnEdit.addEventListener("click", () => {
                beginEdit("music_tracker", r);
                render();
              });

              const btnSave = el("button", { class: "cc-btn", type: "button" }, ["Save"]);
              btnSave.disabled = !isEdit;
              btnSave.addEventListener("click", async () => {
                if (!isEdit) return;

                const id = r.id;
                if (id == null) { setUiStatus("err", "Cannot save: row has no id."); return; }

                const title = safe(draft.song_title).trim();
                const artist = safe(draft.artist).trim();
                if (!artist || !title) { setUiStatus("err", "Artist and Song title are required."); return; }

                const statusCol = detectStatusColumn(r);

                const patch = cleanPatch({
                  release_date: draft.release_date || null,
                  artist: artist,
                  song_title: title,
                  category: safe(draft.category),
                  genre: safe(draft.genre),
                  version: safe(draft.version),
                  bpm: (draft.bpm === "" ? null : draft.bpm),
                  streaming_status: safe(draft.streaming_status),
                  video_status: safe(draft.video_status),
                  demo_preference: safe(draft.demo_preference),
                  pitch_by: safe(draft.pitch_by),
                  remaster_needed: safe(draft.remaster_needed),
                  notes: safe(draft.notes)
                });

                // If statusCol exists, also persist scheduled/live
                if (statusCol) {
                  const v = normalizeStatusValue(draft[statusCol]);
                  if (v === "scheduled" || v === "live") patch[statusCol] = v;
                }

                try {
                  setUiStatus("warn", "Saving changes…");
                  await updateById(sb, "music_tracker", id, patch);
                  resetEdit();
                  await refreshData();
                  render();
                  setUiStatus("ok", "Saved tracker row.");
                } catch (e) {
                  console.error(e);
                  setUiStatus("err", "Save failed: " + (e?.message || String(e)));
                }
              });

              const btnCancel = el("button", { class: "cc-btn", type: "button" }, ["Cancel"]);
              btnCancel.disabled = !isEdit;
              btnCancel.addEventListener("click", () => {
                resetEdit();
                render();
                setUiStatus("ok", "Edit cancelled.");
              });

              const btnDel = el("button", { class: "cc-btn cc-danger", type: "button" }, ["Delete"]);
              btnDel.addEventListener("click", async () => {
                if (isEdit) {
                  const ok = confirmDanger("You’re editing this row. Cancel edit and delete anyway?");
                  if (!ok) return;
                }
                const id = r.id;
                if (id == null) { setUiStatus("err", "Cannot delete: row has no id."); return; }

                const title = safe(r.song_title) || "(untitled)";
                const date = fmtDate(r.release_date) || "(no date)";
                const ok = confirmDanger(`Delete tracker row?\n\n${date} • ${safe(r.artist)} • ${title}\n\nThis cannot be undone.`);
                if (!ok) return;

                try {
                  setUiStatus("warn", "Deleting…");
                  resetEdit();
                  await deleteById(sb, "music_tracker", id);
                  await refreshData();
                  render();
                  setUiStatus("ok", "Deleted tracker row.");
                } catch (e) {
                  console.error(e);
                  setUiStatus("err", "Delete failed: " + (e?.message || String(e)));
                }
              });

              wrap.appendChild(btnEdit);
              wrap.appendChild(btnSave);
              wrap.appendChild(btnCancel);
              wrap.appendChild(btnDel);
              return wrap;
            }
          }
        ];

        function redraw() {
          const rows = applyFilters(trackerCache);
          content.appendChild(
            buildTable(
              cols,
              rows,
              (r) => (isEditingRow("music_tracker", r) ? "cc-rowEdit" : "")
            )
          );
        }

        selArtist.addEventListener("change", redraw);
        qSearch.addEventListener("input", redraw);
        redraw();

      // --- Backlog view ---
      } else {
        const btnNewSong = el("button", { class: "cc-btn", type: "button" }, ["Add New Song"]);
        btnNewSong.addEventListener("click", () => openAddSongModal());
        toolbar.appendChild(btnNewSong);

        function applyFilters(rows) {
          const a = selArtist.value;
          const q = qSearch.value.trim().toLowerCase();
          return rows
            .filter(r => {
              if (a && safe(r.artist) !== a) return false;
              if (!q) return true;
              const hay = (
                safe(r.title) + " " +
                safe(r.notes_performance) + " " +
                safe(r.genre) + " " +
                safe(r.key_root)
              ).toLowerCase();
              return hay.includes(q);
            })
            .map(r => ({ ...r, created_at: fmtDate(r.created_at) }));
        }

        function backlogCell(r, key, node) {
          if (!isEditingRow("songs", r)) return el("div", {}, [safe(r[key])]);
          const commit = () => { draft[key] = node.value; };
          node.addEventListener("input", commit);
          node.addEventListener("change", commit);
          node.value = safe(draft[key]);
          return node;
        }

        const cols = [
          { key: "created_at", label: "Created" },
          {
            label: "Artist",
            render: (r) => {
              if (!isEditingRow("songs", r)) return el("div", {}, [safe(r.artist)]);
              const sel = makeSelect(ARTISTS, draft.artist, "cc-select cc-inlineField");
              sel.addEventListener("change", () => { draft.artist = sel.value; });
              return sel;
            }
          },
          {
            label: "Title",
            render: (r) => backlogCell(r, "title", makeInput(draft.title, "Title", "cc-input cc-inlineField"))
          },
          {
            label: "BPM",
            render: (r) => {
              if (!isEditingRow("songs", r)) return el("div", {}, [safe(r.bpm)]);
              const inp = makeInput(draft.bpm, "BPM", "cc-input cc-inlineTiny");
              inp.inputMode = "numeric";
              inp.addEventListener("input", () => {
                const v = inp.value.trim();
                draft.bpm = v ? Number(v) : null;
              });
              return inp;
            }
          },
          {
            label: "Key root",
            render: (r) => backlogCell(r, "key_root", makeInput(draft.key_root, "C#, F…", "cc-input cc-inlineTiny"))
          },
          {
            label: "Mode",
            render: (r) => backlogCell(r, "mode", makeInput(draft.mode, "major/minor", "cc-input cc-inlineTiny"))
          },
          {
            label: "Genre",
            render: (r) => backlogCell(r, "genre", makeInput(draft.genre, "Genre", "cc-input cc-inlineField"))
          },
          {
            label: "Notes",
            render: (r) => {
              if (!isEditingRow("songs", r)) return el("div", {}, [safe(r.notes_performance)]);
              const ta = makeTextarea(draft.notes_performance, "Notes…", "cc-textarea");
              ta.addEventListener("input", () => { draft.notes_performance = ta.value; });
              return ta;
            }
          },
          {
            label: "Actions",
            render: (r) => {
              const wrap = el("div", { class: "cc-actions" }, []);
              const isEdit = isEditingRow("songs", r);

              const btnEdit = el("button", { class: "cc-btn", type: "button" }, [isEdit ? "Editing…" : "Edit"]);
              btnEdit.disabled = isEdit;
              btnEdit.addEventListener("click", () => {
                beginEdit("songs", r);
                render();
              });

              const btnSave = el("button", { class: "cc-btn", type: "button" }, ["Save"]);
              btnSave.disabled = !isEdit;
              btnSave.addEventListener("click", async () => {
                if (!isEdit) return;

                const id = r.id;
                if (id == null) { setUiStatus("err", "Cannot save: row has no id."); return; }

                const artist = safe(draft.artist).trim();
                const title = safe(draft.title).trim();
                if (!artist || !title) { setUiStatus("err", "Artist and Title are required."); return; }

                const patch = cleanPatch({
                  artist,
                  title,
                  bpm: (draft.bpm === "" ? null : draft.bpm),
                  key_root: safe(draft.key_root),
                  mode: safe(draft.mode),
                  genre: safe(draft.genre),
                  notes_performance: safe(draft.notes_performance)
                });

                try {
                  setUiStatus("warn", "Saving changes…");
                  await updateById(sb, "songs", id, patch);
                  resetEdit();
                  await refreshData();
                  render();
                  setUiStatus("ok", "Saved backlog song.");
                } catch (e) {
                  console.error(e);
                  setUiStatus("err", "Save failed: " + (e?.message || String(e)));
                }
              });

              const btnCancel = el("button", { class: "cc-btn", type: "button" }, ["Cancel"]);
              btnCancel.disabled = !isEdit;
              btnCancel.addEventListener("click", () => {
                resetEdit();
                render();
                setUiStatus("ok", "Edit cancelled.");
              });

              const btnDel = el("button", { class: "cc-btn cc-danger", type: "button" }, ["Delete"]);
              btnDel.addEventListener("click", async () => {
                if (isEdit) {
                  const ok = confirmDanger("You’re editing this row. Cancel edit and delete anyway?");
                  if (!ok) return;
                }

                const id = r.id;
                if (id == null) { setUiStatus("err", "Cannot delete: row has no id."); return; }

                const title = safe(r.title) || "(untitled)";
                const ok = confirmDanger(`Delete backlog song?\n\n${safe(r.artist)} • ${title}\n\nThis cannot be undone.`);
                if (!ok) return;

                try {
                  setUiStatus("warn", "Deleting…");
                  resetEdit();
                  await deleteById(sb, "songs", id);
                  await refreshData();
                  render();
                  setUiStatus("ok", "Deleted backlog song.");
                } catch (e) {
                  console.error(e);
                  setUiStatus("err", "Delete failed: " + (e?.message || String(e)));
                }
              });

              wrap.appendChild(btnEdit);
              wrap.appendChild(btnSave);
              wrap.appendChild(btnCancel);
              wrap.appendChild(btnDel);
              return wrap;
            }
          }
        ];

        function redraw() {
          const rows = applyFilters(songsCache);
          content.appendChild(
            buildTable(
              cols,
              rows,
              (r) => (isEditingRow("songs", r) ? "cc-rowEdit" : "")
            )
          );
        }

        selArtist.addEventListener("change", redraw);
        qSearch.addEventListener("input", redraw);
        redraw();
      }
    }

    // ----- Modals -----
    function openAddSongModal() {
      const fArtist = makeSelect(ARTISTS, "", "cc-select");
      const fTitle = makeInput("", "Title");
      const fBpm = makeInput("", "BPM (optional)");
      fBpm.inputMode = "numeric";
      const fKey = makeInput("", "Key root (optional) e.g. C#, F");
      const fMode = makeInput("", "Mode (optional) e.g. minor/major");
      const fGenre = makeInput("", "Genre (optional)");
      const fNotes = makeInput("", "Notes (optional)");

      const msg = el("div", { class: "cc-note", id: "addSongMsg" }, [""]);

      const btnSave = el("button", { class: "cc-btn", type: "button" }, ["Save to Backlog"]);
      btnSave.addEventListener("click", async () => {
        const payload = {
          artist: fArtist.value.trim(),
          title: fTitle.value.trim()
        };

        if (!payload.artist || !payload.title) {
          msg.innerHTML = "<span class='cc-err'>Artist and Title are required.</span>";
          return;
        }

        const bpmVal = fBpm.value.trim();
        if (bpmVal) payload.bpm = Number(bpmVal);

        if (fKey.value.trim()) payload.key_root = fKey.value.trim();
        if (fMode.value.trim()) payload.mode = fMode.value.trim();
        if (fGenre.value.trim()) payload.genre = fGenre.value.trim();
        if (fNotes.value.trim()) payload.notes_performance = fNotes.value.trim();

        msg.innerHTML = "<span class='cc-warn'>Saving…</span>";

        try {
          const { error } = await window.supabaseClient.from("songs").insert([payload]);
          if (error) throw error;

          msg.innerHTML = "<span class='cc-ok'>Saved.</span>";
          resetEdit();
          await refreshData();
          render();
        } catch (e) {
          console.error(e);
          msg.innerHTML = "<span class='cc-err'>Save failed:</span> " + (e?.message || String(e));
        }
      });

      const body = el("div", {}, [
        el("div", { class: "cc-grid" }, [
          fArtist, fTitle, fBpm, fKey, fMode, fGenre, fNotes
        ]),
        el("div", { class: "cc-note" }, [
          "This adds a song into your backlog (songs table). Then use ",
          el("strong", {}, ["Add from Backlog → Tracker"]),
          " on the Tracker tab to schedule it."
        ]),
        el("div", { class: "cc-toolbar" }, [btnSave]),
        msg
      ]);

      showModal("Add New Song (Backlog)", body);
    }

    function openPullToTrackerModal() {
      const list = songsCache.slice();

      const sel = el("select", { class: "cc-select" }, [
        el("option", { value: "" }, ["Select a song…"]),
        ...list.map(s => el("option", { value: String(s.id) }, [`${safe(s.artist)} • ${safe(s.title)}`]))
      ]);

      const fReleaseDate = el("input", { class: "cc-input", type: "date" });
      const fCategory = makeSelect(TRACKER_CATEGORIES, "", "cc-select");
      const fVersion = makeInput("", "Version (optional) e.g. v6");
      const fStreaming = makeSelect(STREAMING_STATUS, "", "cc-select");
      const fVideo = makeSelect(VIDEO_STATUS, "", "cc-select");
      const fNotes = makeInput("", "Notes (optional)");

      // NEW: status default scheduled (if you have column)
      const fStatus = makeSelect(STATUS_VALUES, "scheduled", "cc-select");

      const msg = el("div", { class: "cc-note" }, [""]);

      const btnAdd = el("button", { class: "cc-btn", type: "button" }, ["Add to Tracker"]);
      btnAdd.addEventListener("click", async () => {
        const id = sel.value;
        if (!id) {
          msg.innerHTML = "<span class='cc-err'>Pick a song first.</span>";
          return;
        }

        const song = list.find(x => String(x.id) === String(id));
        if (!song) {
          msg.innerHTML = "<span class='cc-err'>Song not found.</span>";
          return;
        }

        const payload = {
          artist: song.artist,
          song_title: song.title,
          bpm: song.bpm ?? null,
          genre: song.genre ?? null
        };

        if (fReleaseDate.value) payload.release_date = fReleaseDate.value;
        if (fCategory.value) payload.category = fCategory.value;
        if (fVersion.value.trim()) payload.version = fVersion.value.trim();
        if (fStreaming.value) payload.streaming_status = fStreaming.value;
        if (fVideo.value) payload.video_status = fVideo.value;
        if (fNotes.value.trim()) payload.notes = fNotes.value.trim();

        // set scheduled/live if the column exists in DB:
        // We'll attempt "status" first; if it errors, we try "streaming"
        const desired = fStatus.value;

        msg.innerHTML = "<span class='cc-warn'>Adding…</span>";

        try {
          // Try insert with status
          let { error } = await window.supabaseClient.from("music_tracker").insert([{ ...payload, status: desired }]);
          if (error) {
            // Try insert with streaming if status doesn't exist
            const try2 = await window.supabaseClient.from("music_tracker").insert([{ ...payload, streaming: desired }]);
            if (try2.error) throw try2.error;
          }

          // After successfully adding to tracker, move the source song out of backlog
          await window.supabaseClient
            .from("songs")
            .update({ stage: desired }) // desired is 'scheduled' or 'live'
            .eq("id", Number(id));
          msg.innerHTML = "<span class='cc-ok'>Added to tracker.</span>";
          resetEdit();
          await refreshData();
          render();
        } catch (e) {
          console.error(e);
          msg.innerHTML = "<span class='cc-err'>Add failed:</span> " + (e?.message || String(e));
        }
      });

      const body = el("div", {}, [
        el("div", { class: "cc-grid" }, [
          sel, fReleaseDate, fCategory, fVersion, fStatus, fStreaming, fVideo, fNotes
        ]),
        el("div", { class: "cc-note" }, [
          "This creates a row in ",
          el("code", {}, ["music_tracker"]),
          " using the selected backlog song’s title/artist/BPM/genre. Status defaults to scheduled."
        ]),
        el("div", { class: "cc-toolbar" }, [btnAdd]),
        msg
      ]);

      showModal("Add from Backlog → Tracker", body);
    }

    // ===== Tab events =====
    tabTracker.addEventListener("click", async () => {
      resetEdit();
      mode = "tracker";
      await refreshData();
      render();
    });

    tabBacklog.addEventListener("click", async () => {
      resetEdit();
      mode = "backlog";
      await refreshData();
      render();
    });

    // ===== NEW: Tracker sub-tab events =====
    tabScheduled.addEventListener("click", async () => {
      if (trackerView === "scheduled") return;
      resetEdit();
      trackerView = "scheduled";
      setActiveTrackerSubTab();
      await refreshData();
      render();
    });

    tabLive.addEventListener("click", async () => {
      if (trackerView === "live") return;
      resetEdit();
      trackerView = "live";
      setActiveTrackerSubTab();
      await refreshData();
      render();
    });

    await refreshData();
    render();
  };
})();
