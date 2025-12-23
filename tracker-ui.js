// tracker-ui.js (classic script; attaches window.initTrackerUI)
// Renders:
// - Tracker (music_tracker table)
// - Backlog (songs table)
// - Add new song (insert into songs)
// - Pull song from backlog into tracker (insert into music_tracker)

(function () {
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
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

  // --- minimal styles injected for UI bits ---
  function injectUiStyles() {
    if (document.getElementById("trackerUiStyles")) return;
    const css = `
      .cc-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0;}
      .cc-chip{border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);padding:8px 10px;border-radius:999px;font-size:12px;color:rgba(255,255,255,0.78)}
      .cc-input,.cc-select{border:1px solid rgba(255,255,255,0.12);background:rgba(0,0,0,0.25);color:rgba(255,255,255,0.92);padding:10px 12px;border-radius:12px;font-size:13px;min-width:160px}
      .cc-btn{appearance:none;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.12);color:rgba(255,255,255,0.92);padding:10px 12px;border-radius:12px;font-weight:700;cursor:pointer}
      .cc-btn:hover{background:rgba(255,255,255,0.18)}
      .cc-btn:disabled{opacity:.55;cursor:not-allowed}
      .cc-tableWrap{overflow:auto;border:1px solid rgba(255,255,255,0.12);border-radius:14px;background:rgba(255,255,255,0.04)}
      table.cc-table{width:100%;border-collapse:separate;border-spacing:0}
      .cc-table th,.cc-table td{padding:10px 10px;border-bottom:1px solid rgba(255,255,255,0.10);font-size:12px;vertical-align:top}
      .cc-table th{position:sticky;top:0;background:rgba(12,16,22,0.92);backdrop-filter:blur(8px);text-align:left;color:rgba(255,255,255,0.82)}
      .cc-table tr:hover td{background:rgba(255,255,255,0.03)}
      .cc-muted{color:rgba(255,255,255,0.65)}
      .cc-ok{color:#40d67f;font-weight:800}
      .cc-warn{color:#ffb020;font-weight:800}
      .cc-err{color:#ff5d5d;font-weight:800}
      .cc-tabs{display:flex;gap:8px;margin-top:8px}
      .cc-tab{border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);padding:8px 10px;border-radius:12px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.82)}
      .cc-tab.active{background:rgba(64,214,127,0.12);border-color:rgba(64,214,127,0.35)}
      .cc-modalBack{position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:14px;z-index:9999}
      .cc-modal{max-width:720px;width:100%;border:1px solid rgba(255,255,255,0.14);border-radius:16px;background:rgba(12,16,22,0.96);box-shadow:0 20px 80px rgba(0,0,0,0.6);padding:14px}
      .cc-modalHeader{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
      .cc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      @media (max-width:740px){.cc-grid{grid-template-columns:1fr}}
      .cc-note{font-size:12px;color:rgba(255,255,255,0.65);line-height:1.35;margin-top:6px}
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
    const { data, error } = await sb
      .from("songs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function loadTracker(sb) {
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

  function buildTable(columns, rows) {
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
        const tds = columns.map(c => el("td", {}, [safe(r[c.key])]));
        tbody.appendChild(el("tr", {}, tds));
      }
    }

    return el("div", { class: "cc-tableWrap" }, [
      el("table", { class: "cc-table" }, [thead, tbody])
    ]);
  }

  // --- MAIN INIT ---
  window.initTrackerUI = async function initTrackerUI({ rootId = "appRoot" } = {}) {
    injectUiStyles();

    const root = document.getElementById(rootId);
    if (!root) throw new Error("Missing #"+rootId);

    const sb = await requireSupabase();

    const statusLine = el("div", { class: "cc-note", id: "uiStatus" }, ["Loading…"]);
    const tabs = el("div", { class: "cc-tabs" }, []);
    const tabTracker = el("div", { class: "cc-tab active" }, ["Tracker"]);
    const tabBacklog = el("div", { class: "cc-tab" }, ["Backlog"]);
    tabs.appendChild(tabTracker);
    tabs.appendChild(tabBacklog);

    const toolbar = el("div", { class: "cc-toolbar" }, []);
    const content = el("div", { id: "uiContent" }, []);

    root.innerHTML = "";
    root.appendChild(tabs);
    root.appendChild(toolbar);
    root.appendChild(content);
    root.appendChild(statusLine);

    let mode = "tracker"; // "tracker" | "backlog"
    let songsCache = [];
    let trackerCache = [];

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
    }

    async function refreshData() {
      setUiStatus("warn", "Refreshing data…");
      try {
        // load both so switching tabs is instant
        [songsCache, trackerCache] = await Promise.all([loadSongs(sb), loadTracker(sb)]);
        setUiStatus("ok", `Loaded ${trackerCache.length} tracker rows and ${songsCache.length} songs.`);
      } catch (e) {
        console.error(e);
        setUiStatus("err", "Load failed: " + (e?.message || String(e)));
      }
    }

    function render() {
      toolbar.innerHTML = "";
      content.innerHTML = "";

      setActiveTab();

      const btnRefresh = el("button", { class: "cc-btn", type: "button" }, ["Refresh"]);
      btnRefresh.addEventListener("click", async () => {
        await refreshData();
        render();
      });

      // shared filter widgets
      const artistOptions =
        mode === "tracker"
          ? uniq(trackerCache.map(r => r.artist))
          : uniq(songsCache.map(r => r.artist));

      const selArtist = el("select", { class: "cc-select" }, [
        el("option", { value: "" }, ["All artists"]),
        ...artistOptions.map(a => el("option", { value: a }, [a]))
      ]);

      const qSearch = el("input", { class: "cc-input", placeholder: "Search title / notes…" });

      toolbar.appendChild(el("span", { class: "cc-chip" }, [mode === "tracker" ? "Tracker view" : "Backlog view"]));
      toolbar.appendChild(selArtist);
      toolbar.appendChild(qSearch);
      toolbar.appendChild(btnRefresh);

      if (mode === "tracker") {
        const btnPull = el("button", { class: "cc-btn", type: "button" }, ["Add from Backlog → Tracker"]);
        const btnNewSong = el("button", { class: "cc-btn", type: "button" }, ["Add New Song (Backlog)"]);

        btnNewSong.addEventListener("click", () => openAddSongModal());
        btnPull.addEventListener("click", () => openPullToTrackerModal());

        toolbar.appendChild(btnPull);
        toolbar.appendChild(btnNewSong);

        // tracker columns (based on your schema screenshots)
        const cols = [
          { key: "release_date", label: "Release date" },
          { key: "artist", label: "Artist" },
          { key: "song_title", label: "Song title" },
          { key: "category", label: "Category" },
          { key: "genre", label: "Genre" },
          { key: "version", label: "Version" },
          { key: "bpm", label: "BPM" },
          { key: "streaming_status", label: "Streaming" },
          { key: "video_status", label: "Video" },
          { key: "demo_preference", label: "Demo pref" },
          { key: "pitch_by", label: "Pitch by" },
          { key: "remaster_needed", label: "Remaster?" },
          { key: "notes", label: "Notes" }
        ];

        function applyFilters(rows) {
          const a = selArtist.value;
          const q = qSearch.value.trim().toLowerCase();
          return rows.filter(r => {
            if (a && safe(r.artist) !== a) return false;
            if (!q) return true;
            const hay = (safe(r.song_title) + " " + safe(r.notes) + " " + safe(r.genre) + " " + safe(r.streaming_status) + " " + safe(r.video_status)).toLowerCase();
            return hay.includes(q);
          }).map(r => ({ ...r, release_date: fmtDate(r.release_date) }));
        }

        function redraw() {
          const rows = applyFilters(trackerCache);
          content.appendChild(buildTable(cols, rows));
        }

        selArtist.addEventListener("change", redraw);
        qSearch.addEventListener("input", redraw);
        redraw();

      } else {
        // backlog view
        const btnNewSong = el("button", { class: "cc-btn", type: "button" }, ["Add New Song"]);
        btnNewSong.addEventListener("click", () => openAddSongModal());
        toolbar.appendChild(btnNewSong);

        // backlog columns (based on your songs schema screenshot)
        const cols = [
          { key: "created_at", label: "Created" },
          { key: "artist", label: "Artist" },
          { key: "title", label: "Title" },
          { key: "bpm", label: "BPM" },
          { key: "key_root", label: "Key root" },
          { key: "mode", label: "Mode" },
          { key: "genre", label: "Genre" },
          { key: "notes_performance", label: "Notes" }
        ];

        function applyFilters(rows) {
          const a = selArtist.value;
          const q = qSearch.value.trim().toLowerCase();
          return rows.filter(r => {
            if (a && safe(r.artist) !== a) return false;
            if (!q) return true;
            const hay = (safe(r.title) + " " + safe(r.notes_performance) + " " + safe(r.genre) + " " + safe(r.key_root)).toLowerCase();
            return hay.includes(q);
          }).map(r => ({ ...r, created_at: fmtDate(r.created_at) }));
        }

        function redraw() {
          const rows = applyFilters(songsCache);
          content.appendChild(buildTable(cols, rows));
        }

        selArtist.addEventListener("change", redraw);
        qSearch.addEventListener("input", redraw);
        redraw();
      }
    }

    function openAddSongModal() {
      // Minimal insert based on your songs columns.
      const fArtist = el("input", { class: "cc-input", placeholder: "Artist (Ivory Ocean / Ivory Haven)" });
      const fTitle = el("input", { class: "cc-input", placeholder: "Title" });
      const fBpm = el("input", { class: "cc-input", placeholder: "BPM (optional)", inputmode: "numeric" });
      const fKey = el("input", { class: "cc-input", placeholder: "Key root (optional) e.g. C#, F" });
      const fMode = el("input", { class: "cc-input", placeholder: "Mode (optional) e.g. minor/major" });
      const fGenre = el("input", { class: "cc-input", placeholder: "Genre (optional)" });
      const fNotes = el("input", { class: "cc-input", placeholder: "Notes (optional)" });

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
          const { error } = await sb.from("songs").insert([payload]);
          if (error) throw error;

          msg.innerHTML = "<span class='cc-ok'>Saved.</span>";
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
          " on the Tracker tab to schedule/activate it."
        ]),
        el("div", { class: "cc-toolbar" }, [btnSave]),
        msg
      ]);

      showModal("Add New Song (Backlog)", body);
    }

    function openPullToTrackerModal() {
      // Choose a song from songs table and insert into music_tracker with mapped fields.
      const list = songsCache.slice();

      const sel = el("select", { class: "cc-select" }, [
        el("option", { value: "" }, ["Select a song…"]),
        ...list.map(s => el("option", { value: String(s.id) }, [`${safe(s.artist)} • ${safe(s.title)}`]))
      ]);

      const fReleaseDate = el("input", { class: "cc-input", type: "date" });
      const fCategory = el("input", { class: "cc-input", placeholder: "Category (optional)" });
      const fVersion = el("input", { class: "cc-input", placeholder: "Version (optional) e.g. v6" });
      const fStreaming = el("input", { class: "cc-input", placeholder: "Streaming status (optional)" });
      const fVideo = el("input", { class: "cc-input", placeholder: "Video status (optional)" });
      const fNotes = el("input", { class: "cc-input", placeholder: "Notes (optional)" });

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
        if (fCategory.value.trim()) payload.category = fCategory.value.trim();
        if (fVersion.value.trim()) payload.version = fVersion.value.trim();
        if (fStreaming.value.trim()) payload.streaming_status = fStreaming.value.trim();
        if (fVideo.value.trim()) payload.video_status = fVideo.value.trim();
        if (fNotes.value.trim()) payload.notes = fNotes.value.trim();

        msg.innerHTML = "<span class='cc-warn'>Adding…</span>";

        try {
          const { error } = await sb.from("music_tracker").insert([payload]);
          if (error) throw error;

          msg.innerHTML = "<span class='cc-ok'>Added to tracker.</span>";
          await refreshData();
          render();
        } catch (e) {
          console.error(e);
          msg.innerHTML = "<span class='cc-err'>Add failed:</span> " + (e?.message || String(e));
        }
      });

      const body = el("div", {}, [
        el("div", { class: "cc-grid" }, [
          sel, fReleaseDate, fCategory, fVersion, fStreaming, fVideo, fNotes
        ]),
        el("div", { class: "cc-note" }, [
          "This creates a row in ",
          el("code", {}, ["music_tracker"]),
          " using the selected backlog song’s title/artist/BPM/genre, plus any fields you fill in here."
        ]),
        el("div", { class: "cc-toolbar" }, [btnAdd]),
        msg
      ]);

      showModal("Add from Backlog → Tracker", body);
    }

    // Wire tabs
    tabTracker.addEventListener("click", () => { mode = "tracker"; render(); });
    tabBacklog.addEventListener("click", () => { mode = "backlog"; render(); });

    // initial load
    await refreshData();
    render();
  };
})();
