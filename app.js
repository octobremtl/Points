(() => {
  "use strict";

  const STORAGE_KEY = "points-enfants-v1";
  const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function defaultHabits() {
    return [
      { id: uid(), label: "Brossage des dents", points: 1 },
      { id: uid(), label: "Bons mots avec les autres", points: 1 },
      { id: uid(), label: "Préparer mes choses pour l'école", points: 1 },
      { id: uid(), label: "Routine du matin à l'heure", points: 1 },
      { id: uid(), label: "Devoirs sans chialer ni niaiser", points: 1 },
      { id: uid(), label: "Garder ma bonne humeur", points: 1 },
      { id: uid(), label: "Bonne action de la semaine", points: 1 },
      { id: uid(), label: "Défi de la semaine", points: 2, note: "À définir chaque semaine" },
    ];
  }

  function defaultData() {
    return {
      children: [
        { id: uid(), name: "Enfant 1" },
        { id: uid(), name: "Enfant 2" },
      ],
      weeks: {},
      settings: { smallThreshold: 50, bigThreshold: 80 },
    };
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed.children || !parsed.weeks || !parsed.settings) return defaultData();
      return parsed;
    } catch (e) {
      console.warn("Données corrompues, réinitialisation.", e);
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadData();

  // --- Week helpers ---
  function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKeyOf(monday) {
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, "0");
    const d = String(monday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatWeekLabel(monday) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const opts = { day: "numeric", month: "short" };
    const startStr = monday.toLocaleDateString("fr-FR", opts);
    const endStr = sunday.toLocaleDateString("fr-FR", { ...opts, year: "numeric" });
    return `${startStr} – ${endStr}`;
  }

  let currentMonday = getMonday(new Date());

  function currentWeekKey() {
    return weekKeyOf(currentMonday);
  }

  function findLatestPriorHabits(beforeKey) {
    const keys = Object.keys(state.weeks).filter((k) => k < beforeKey).sort();
    for (let i = keys.length - 1; i >= 0; i--) {
      const w = state.weeks[keys[i]];
      if (w && w.habits && w.habits.length) return w.habits;
    }
    return null;
  }

  function ensureWeek(weekKey) {
    if (state.weeks[weekKey]) return state.weeks[weekKey];
    const inherited = findLatestPriorHabits(weekKey);
    const habits = (inherited || defaultHabits()).map((h) => ({ ...h }));
    state.weeks[weekKey] = { habits, marks: {} };
    saveData();
    return state.weeks[weekKey];
  }

  function ensureChildMarks(week, childId) {
    if (!week.marks[childId]) week.marks[childId] = {};
    return week.marks[childId];
  }

  // --- Rendering ---
  const boardsEl = document.getElementById("boards");
  const weekLabelBtn = document.getElementById("today-week");

  function render() {
    const weekKey = currentWeekKey();
    const week = ensureWeek(weekKey);
    weekLabelBtn.textContent = formatWeekLabel(currentMonday);

    boardsEl.innerHTML = "";
    state.children.forEach((child) => {
      boardsEl.appendChild(renderBoard(child, week));
    });
  }

  function cellState(week, childId, habitId, dayKey) {
    const marks = ensureChildMarks(week, childId);
    return (marks[habitId] && marks[habitId][dayKey]) || null; // null | 'done' | 'missed'
  }

  function setCellState(week, childId, habitId, dayKey, value) {
    const marks = ensureChildMarks(week, childId);
    if (!marks[habitId]) marks[habitId] = {};
    if (value === null) delete marks[habitId][dayKey];
    else marks[habitId][dayKey] = value;
    saveData();
  }

  function nextState(s) {
    if (s === null) return "done";
    if (s === "done") return "missed";
    return null;
  }

  function symbolFor(s) {
    if (s === "done") return "✓";
    if (s === "missed") return "✗";
    return "";
  }

  function renderBoard(child, week) {
    const board = document.createElement("section");
    board.className = "board";

    const title = document.createElement("h2");
    title.textContent = child.name;
    board.appendChild(title);

    const table = document.createElement("table");
    table.className = "tracker";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.appendChild(document.createElement("th"));
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0..Sun=6
    const isCurrentWeek = weekKeyOf(getMonday(new Date())) === weekKeyOf(currentMonday);
    DAYS.forEach((d, i) => {
      const th = document.createElement("th");
      th.textContent = d;
      if (isCurrentWeek && i === todayIdx) th.classList.add("today");
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    let dailyEarned = new Array(7).fill(0);
    let totalEarned = 0;
    let totalPossible = 0;

    week.habits.forEach((habit) => {
      const tr = document.createElement("tr");
      const nameTd = document.createElement("td");
      nameTd.className = "habit-name";
      const labelSpan = document.createElement("span");
      labelSpan.className = "habit-label";
      labelSpan.textContent = habit.points > 1 ? `${habit.label} (${habit.points} pts)` : habit.label;
      nameTd.appendChild(labelSpan);
      if (habit.note) {
        const noteSpan = document.createElement("span");
        noteSpan.className = "habit-note";
        noteSpan.textContent = habit.note;
        nameTd.appendChild(noteSpan);
      }
      tr.appendChild(nameTd);

      DAY_KEYS.forEach((dayKey, i) => {
        const td = document.createElement("td");
        td.className = "cell";
        if (isCurrentWeek && i === todayIdx) td.classList.add("today");
        const s = cellState(week, child.id, habit.id, dayKey);
        if (s === "done") {
          td.classList.add("done");
          totalEarned += habit.points;
          totalPossible += habit.points;
          dailyEarned[i] += habit.points;
        } else if (s === "missed") {
          totalPossible += habit.points;
        }
        td.textContent = symbolFor(s);
        td.addEventListener("click", () => {
          const cur = cellState(week, child.id, habit.id, dayKey);
          setCellState(week, child.id, habit.id, dayKey, nextState(cur));
          render();
        });
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    // Footer: daily totals
    const footTr = document.createElement("tr");
    footTr.className = "tfoot-row";
    const footLabel = document.createElement("td");
    footLabel.textContent = "Total";
    footTr.appendChild(footLabel);
    dailyEarned.forEach((v) => {
      const td = document.createElement("td");
      td.textContent = v || "";
      footTr.appendChild(td);
    });
    tbody.appendChild(footTr);

    table.appendChild(tbody);
    board.appendChild(table);

    const pct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
    const summary = document.createElement("p");
    summary.className = "summary";
    summary.textContent = `${totalEarned} / ${totalPossible} points cette semaine (${pct}%)`;
    board.insertBefore(summary, table);

    const { tier, label } = tierFor(pct, totalPossible);
    const banner = document.createElement("div");
    banner.className = `reward-banner reward-${tier}`;
    banner.textContent = tier === "none" ? label : `${label} débloquée !`;
    board.insertBefore(banner, table);

    return board;
  }

  // --- Stats shared between the board view and the history view ---
  function computeWeekStats(week, childId) {
    let totalEarned = 0;
    let totalPossible = 0;
    week.habits.forEach((habit) => {
      const marks = week.marks[childId] && week.marks[childId][habit.id];
      if (!marks) return;
      DAY_KEYS.forEach((dayKey) => {
        const s = marks[dayKey];
        if (s === "done") {
          totalEarned += habit.points;
          totalPossible += habit.points;
        } else if (s === "missed") {
          totalPossible += habit.points;
        }
      });
    });
    const pct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
    return { totalEarned, totalPossible, pct };
  }

  function tierFor(pct, totalPossible) {
    const { smallThreshold, bigThreshold } = state.settings;
    if (totalPossible > 0 && pct >= bigThreshold) return { tier: "big", label: "🏆 Grosse récompense", icon: "🏆" };
    if (totalPossible > 0 && pct >= smallThreshold) return { tier: "small", label: "🎁 Petite récompense", icon: "🎁" };
    return { tier: "none", label: "Pas encore de récompense", icon: "" };
  }

  // --- Week navigation ---
  document.getElementById("prev-week").addEventListener("click", () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    currentMonday = new Date(currentMonday);
    render();
  });
  document.getElementById("next-week").addEventListener("click", () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    currentMonday = new Date(currentMonday);
    render();
  });
  weekLabelBtn.addEventListener("click", () => {
    currentMonday = getMonday(new Date());
    render();
  });

  // --- History dialog ---
  const historyDialog = document.getElementById("history-dialog");

  function renderHistory() {
    const container = document.getElementById("history-content");
    container.innerHTML = "";

    const weekKeys = Object.keys(state.weeks)
      .filter((k) => state.children.some((c) => computeWeekStats(state.weeks[k], c.id).totalPossible > 0))
      .sort()
      .reverse();

    if (!weekKeys.length) {
      container.innerHTML = '<p class="hint">Aucune semaine avec des points enregistrés pour l’instant.</p>';
      return;
    }

    const table = document.createElement("table");
    table.className = "tracker history-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const thWeek = document.createElement("th");
    thWeek.textContent = "Semaine";
    headRow.appendChild(thWeek);
    state.children.forEach((child) => {
      const th = document.createElement("th");
      th.textContent = child.name;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    weekKeys.forEach((weekKey) => {
      const week = state.weeks[weekKey];
      const monday = new Date(`${weekKey}T00:00:00`);
      const tr = document.createElement("tr");

      const tdWeek = document.createElement("td");
      tdWeek.className = "habit-name";
      tdWeek.textContent = formatWeekLabel(monday);
      tr.appendChild(tdWeek);

      state.children.forEach((child) => {
        const stats = computeWeekStats(week, child.id);
        const { icon, label } = tierFor(stats.pct, stats.totalPossible);
        const td = document.createElement("td");
        td.title = `${stats.totalEarned} / ${stats.totalPossible} points — ${label}`;
        td.textContent = stats.totalPossible > 0 ? `${stats.pct}% ${icon}` : "—";
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  document.getElementById("open-history").addEventListener("click", () => {
    renderHistory();
    historyDialog.showModal();
  });

  // --- Habits dialog ---
  const habitsDialog = document.getElementById("habits-dialog");
  const habitsList = document.getElementById("habits-list");

  function renderHabitsDialog() {
    const week = ensureWeek(currentWeekKey());
    habitsList.innerHTML = "";
    week.habits.forEach((habit) => {
      const row = document.createElement("div");
      row.className = "habit-row";

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = habit.label;
      labelInput.placeholder = "Nom de l'habitude";
      labelInput.addEventListener("input", () => {
        habit.label = labelInput.value;
        saveData();
      });

      const pointsInput = document.createElement("input");
      pointsInput.type = "number";
      pointsInput.min = "1";
      pointsInput.step = "1";
      pointsInput.value = habit.points;
      pointsInput.title = "Points";
      pointsInput.addEventListener("input", () => {
        habit.points = Math.max(1, parseInt(pointsInput.value, 10) || 1);
        saveData();
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "Supprimer";
      removeBtn.addEventListener("click", () => {
        week.habits = week.habits.filter((h) => h.id !== habit.id);
        saveData();
        renderHabitsDialog();
      });

      row.appendChild(labelInput);
      row.appendChild(pointsInput);
      row.appendChild(removeBtn);
      habitsList.appendChild(row);
    });
  }

  document.getElementById("edit-habits").addEventListener("click", () => {
    renderHabitsDialog();
    habitsDialog.showModal();
  });

  document.getElementById("add-habit").addEventListener("click", () => {
    const week = ensureWeek(currentWeekKey());
    week.habits.push({ id: uid(), label: "Nouvelle habitude", points: 1 });
    saveData();
    renderHabitsDialog();
  });

  document.getElementById("copy-prev-week").addEventListener("click", () => {
    const prevMonday = new Date(currentMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const prevKey = weekKeyOf(prevMonday);
    const prevWeek = state.weeks[prevKey];
    if (!prevWeek || !prevWeek.habits.length) {
      alert("Aucune habitude trouvée pour la semaine précédente.");
      return;
    }
    const week = ensureWeek(currentWeekKey());
    week.habits = prevWeek.habits.map((h) => ({ ...h, id: uid() }));
    saveData();
    renderHabitsDialog();
  });

  habitsDialog.addEventListener("close", render);

  // --- Settings dialog ---
  const settingsDialog = document.getElementById("settings-dialog");
  const childrenList = document.getElementById("children-list");
  const smallThresholdInput = document.getElementById("small-threshold");
  const bigThresholdInput = document.getElementById("big-threshold");

  function renderChildrenList() {
    childrenList.innerHTML = "";
    state.children.forEach((child) => {
      const row = document.createElement("div");
      row.className = "child-row";

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = child.name;
      nameInput.addEventListener("input", () => {
        child.name = nameInput.value;
        saveData();
      });

      const spacer = document.createElement("span");

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "✕";
      removeBtn.title = "Supprimer";
      removeBtn.addEventListener("click", () => {
        if (state.children.length <= 1) {
          alert("Il doit rester au moins un enfant.");
          return;
        }
        state.children = state.children.filter((c) => c.id !== child.id);
        saveData();
        renderChildrenList();
      });

      row.appendChild(nameInput);
      row.appendChild(spacer);
      row.appendChild(removeBtn);
      childrenList.appendChild(row);
    });
  }

  document.getElementById("open-settings").addEventListener("click", () => {
    renderChildrenList();
    smallThresholdInput.value = state.settings.smallThreshold;
    bigThresholdInput.value = state.settings.bigThreshold;
    settingsDialog.showModal();
  });

  document.getElementById("add-child").addEventListener("click", () => {
    state.children.push({ id: uid(), name: "Nouvel enfant" });
    saveData();
    renderChildrenList();
  });

  smallThresholdInput.addEventListener("change", () => {
    state.settings.smallThreshold = Math.min(100, Math.max(0, parseInt(smallThresholdInput.value, 10) || 0));
    saveData();
  });
  bigThresholdInput.addEventListener("change", () => {
    state.settings.bigThreshold = Math.min(100, Math.max(0, parseInt(bigThresholdInput.value, 10) || 0));
    saveData();
  });

  document.getElementById("export-data").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `points-enfants-${currentWeekKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-data").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.children || !parsed.weeks || !parsed.settings) throw new Error("format invalide");
        state = parsed;
        saveData();
        renderChildrenList();
        render();
        alert("Import réussi.");
      } catch (err) {
        alert("Fichier invalide : " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("reset-data").addEventListener("click", () => {
    if (!confirm("Effacer toutes les données (habitudes, points, enfants) ? Cette action est irréversible.")) return;
    state = defaultData();
    saveData();
    renderChildrenList();
    render();
  });

  settingsDialog.addEventListener("close", render);

  render();
})();
