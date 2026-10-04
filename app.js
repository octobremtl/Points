(() => {
  "use strict";

  const STORAGE_KEY = "points-enfants-v1";
  const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const MASTERY_STREAK = 10; // consecutive days before suggesting "mastered"

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function defaultHabits() {
    return [
      { id: uid(), label: "Brossage des dents", points: 1, occurrences: 2, occurrenceLabels: ["Matin", "Soir"], status: "active" },
      { id: uid(), label: "Pas de gros mots ni d'impolitesse", points: 1, occurrences: 1, status: "active" },
      { id: uid(), label: "Bons mots avec les autres", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Préparer mes choses pour l'école", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Routine du matin à l'heure", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Devoirs sans chialer ni niaiser", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Garder ma bonne humeur", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Bonne action", points: 1, occurrences: 1, status: "waiting" },
      { id: uid(), label: "Défi à relever", points: 2, occurrences: 1, status: "waiting", note: "À définir ensemble" },
    ];
  }

  const PALETTE = ["#f3c94f", "#5b8fc7", "#e2836f", "#7cbf8e", "#b98fd1", "#e0a2c2"];

  function colorForChild(child, index) {
    return child.color || PALETTE[index % PALETTE.length];
  }

  function hexToRgba(hex, alpha) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return `rgba(0,0,0,${alpha})`;
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyChildColor(board, child, index) {
    const color = colorForChild(child, index);
    board.style.setProperty("--child-color", color);
    board.style.setProperty("--child-color-soft", hexToRgba(color, 0.28));
  }

  function defaultChild(name, color) {
    return { id: uid(), name, color, points: 0, redeemed: [] };
  }

  function defaultData() {
    return {
      version: 2,
      children: [defaultChild("Éloïse", "#f3c94f"), defaultChild("Zack", "#5b8fc7")],
      habits: defaultHabits(),
      marks: {}, // marks[childId][habitId][dateKey] = [bool, ...] (length = habit.occurrences)
      settings: { smallThreshold: 10, bigThreshold: 25, surpriseChance: 0.2 },
    };
  }

  // Best-effort migration from the old weekly % model (v1, no `version` field)
  // to the continuous points-bank model (v2). Historical daily detail isn't
  // kept, but points already earned are converted into a starting balance so
  // nothing already accomplished is lost.
  function migrateToV2(old) {
    const fresh = defaultData();
    if (Array.isArray(old.children) && old.children.length) {
      fresh.children = old.children.map((c, i) => ({
        id: c.id || uid(),
        name: c.name || `Enfant ${i + 1}`,
        color: c.color || PALETTE[i % PALETTE.length],
        points: 0,
        redeemed: [],
      }));
    }
    const earnedByChild = {};
    Object.values(old.weeks || {}).forEach((week) => {
      (week.habits || []).forEach((habit) => {
        fresh.children.forEach((child) => {
          const marks = week.marks && week.marks[child.id] && week.marks[child.id][habit.id];
          if (!marks) return;
          Object.values(marks).forEach((s) => {
            if (s === "done") earnedByChild[child.id] = (earnedByChild[child.id] || 0) + (habit.points || 1);
          });
        });
      });
    });
    fresh.children.forEach((child) => {
      child.points = earnedByChild[child.id] || 0;
    });
    return fresh;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      if (!parsed.children) return defaultData();
      if (parsed.version === 2) return parsed;
      return migrateToV2(parsed);
    } catch (e) {
      console.warn("Données corrompues, réinitialisation.", e);
      return defaultData();
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadData();

  // --- Date helpers ---
  function toDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getMonday(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
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
  let currentView = "day";
  let selectedDayIndex = (new Date().getDay() + 6) % 7;

  function isViewingCurrentWeek() {
    return toDateKey(getMonday(new Date())) === toDateKey(currentMonday);
  }

  function selectedDateKey() {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + selectedDayIndex);
    return toDateKey(d);
  }

  // --- Marks (per child, per habit, per date => array of booleans) ---
  function getSlots(childId, habitId, dateKey, occurrences) {
    const arr = state.marks[childId] && state.marks[childId][habitId] && state.marks[childId][habitId][dateKey];
    const out = new Array(occurrences).fill(false);
    if (arr) for (let i = 0; i < occurrences; i++) out[i] = !!arr[i];
    return out;
  }

  function isFullyDone(childId, habit, dateKey) {
    return getSlots(childId, habit.id, dateKey, habit.occurrences || 1).every(Boolean);
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 200);
    }, 2200);
  }

  function maybeSurprise(child) {
    const chance = state.settings.surpriseChance || 0;
    if (chance > 0 && Math.random() < chance) {
      child.points += 1;
      showToast(`✨ Bonus surprise pour ${child.name} : +1 point !`);
    }
  }

  function setSlot(child, habit, dateKey, slotIndex, value) {
    const occurrences = habit.occurrences || 1;
    const slots = getSlots(child.id, habit.id, dateKey, occurrences);
    if (slots[slotIndex] === value) return;
    slots[slotIndex] = value;

    state.marks[child.id] = state.marks[child.id] || {};
    state.marks[child.id][habit.id] = state.marks[child.id][habit.id] || {};
    if (slots.some(Boolean)) state.marks[child.id][habit.id][dateKey] = slots;
    else delete state.marks[child.id][habit.id][dateKey];

    const delta = value ? 1 : -1;
    child.points = Math.max(0, child.points + delta * habit.points);
    saveData();
    if (value) maybeSurprise(child);
  }

  function currentStreak(childId, habit) {
    let streak = 0;
    const d = new Date();
    for (;;) {
      const key = toDateKey(d);
      if (isFullyDone(childId, habit, key)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  }

  function pointsEarnedOnDate(childId, dateKey) {
    let sum = 0;
    state.habits.forEach((habit) => {
      const slots = getSlots(childId, habit.id, dateKey, habit.occurrences || 1);
      sum += slots.filter(Boolean).length * habit.points;
    });
    return sum;
  }

  function totalEverEarned(child) {
    return child.points + child.redeemed.reduce((sum, r) => sum + r.cost, 0);
  }

  function rewardProgress(child) {
    const { smallThreshold, bigThreshold } = state.settings;
    if (child.points >= bigThreshold) {
      return { tier: "big", cost: bigThreshold, ready: true, pct: 100, label: "🏆 Grosse récompense disponible !" };
    }
    if (child.points >= smallThreshold) {
      const pct = bigThreshold > smallThreshold ? Math.round(((child.points - smallThreshold) / (bigThreshold - smallThreshold)) * 100) : 100;
      return { tier: "small", cost: smallThreshold, ready: true, pct, nextLabel: `vers la grosse récompense (${bigThreshold} pts)` };
    }
    const pct = smallThreshold > 0 ? Math.round((child.points / smallThreshold) * 100) : 0;
    return { tier: "none", cost: smallThreshold, ready: false, pct, nextLabel: `vers la petite récompense (${smallThreshold} pts)` };
  }

  function redeem(child, tier) {
    const cost = tier === "big" ? state.settings.bigThreshold : state.settings.smallThreshold;
    if (child.points < cost) return;
    child.points -= cost;
    child.redeemed.push({ tier, cost, date: toDateKey(new Date()) });
    saveData();
    render();
    showToast(`${tier === "big" ? "🏆" : "🎁"} Récompense échangée pour ${child.name} !`);
  }

  function undoRedeem(child, redeemedIndex) {
    const entry = child.redeemed[redeemedIndex];
    if (!entry) return;
    child.redeemed.splice(redeemedIndex, 1);
    child.points += entry.cost;
    saveData();
    render();
    renderHistory();
    showToast(`↩️ Échange annulé pour ${child.name} : +${entry.cost} points remis.`);
  }

  // --- Rendering ---
  const boardsEl = document.getElementById("boards");
  const weekLabelBtn = document.getElementById("today-week");
  const dayChipsEl = document.getElementById("day-chips");
  const viewDayBtn = document.getElementById("view-day");
  const viewWeekBtn = document.getElementById("view-week");

  function renderDayChips() {
    dayChipsEl.innerHTML = "";
    const todayIdx = (new Date().getDay() + 6) % 7;
    const isCurrentWeek = isViewingCurrentWeek();
    DAYS.forEach((d, i) => {
      const dayDate = new Date(currentMonday);
      dayDate.setDate(dayDate.getDate() + i);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "day-chip";
      if (i === selectedDayIndex) chip.classList.add("active");
      if (isCurrentWeek && i === todayIdx) chip.classList.add("is-today");
      chip.innerHTML = `${d}<span class="chip-date">${dayDate.getDate()}</span>`;
      chip.addEventListener("click", () => {
        selectedDayIndex = i;
        render();
      });
      dayChipsEl.appendChild(chip);
    });
  }

  function render() {
    weekLabelBtn.textContent = formatWeekLabel(currentMonday);

    viewDayBtn.classList.toggle("active", currentView === "day");
    viewWeekBtn.classList.toggle("active", currentView === "week");
    viewDayBtn.setAttribute("aria-selected", String(currentView === "day"));
    viewWeekBtn.setAttribute("aria-selected", String(currentView === "week"));
    dayChipsEl.hidden = currentView !== "day";
    if (currentView === "day") renderDayChips();

    boardsEl.innerHTML = "";
    state.children.forEach((child, index) => {
      const board = currentView === "day" ? renderBoardDay(child) : renderBoardWeek(child);
      applyChildColor(board, child, index);
      boardsEl.appendChild(board);
    });
  }

  viewDayBtn.addEventListener("click", () => {
    currentView = "day";
    render();
  });
  viewWeekBtn.addEventListener("click", () => {
    currentView = "week";
    render();
  });

  function renderPointsHeader(board, child) {
    const balance = document.createElement("div");
    balance.className = "points-balance";
    balance.innerHTML = `<span class="points-number">${child.points}</span><span class="points-label">points</span>`;
    board.appendChild(balance);

    const progress = rewardProgress(child);
    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${Math.max(0, Math.min(100, progress.pct))}%`;
    track.appendChild(fill);
    board.appendChild(track);

    const caption = document.createElement("p");
    caption.className = "progress-caption";
    caption.textContent = progress.tier === "big" ? "Les deux récompenses sont disponibles !" : progress.nextLabel ? `${child.points} / ${progress.tier === "small" ? state.settings.bigThreshold : state.settings.smallThreshold} points ${progress.nextLabel}` : "";
    board.appendChild(caption);

    const redeemRow = document.createElement("div");
    redeemRow.className = "redeem-row";

    const smallBtn = document.createElement("button");
    smallBtn.type = "button";
    smallBtn.className = "btn btn-small";
    smallBtn.textContent = `🎁 Petite (${state.settings.smallThreshold} pts)`;
    smallBtn.disabled = child.points < state.settings.smallThreshold;
    smallBtn.addEventListener("click", () => redeem(child, "small"));
    redeemRow.appendChild(smallBtn);

    const bigBtn = document.createElement("button");
    bigBtn.type = "button";
    bigBtn.className = "btn btn-small";
    bigBtn.textContent = `🏆 Grosse (${state.settings.bigThreshold} pts)`;
    bigBtn.disabled = child.points < state.settings.bigThreshold;
    bigBtn.addEventListener("click", () => redeem(child, "big"));
    redeemRow.appendChild(bigBtn);

    board.appendChild(redeemRow);
  }

  function renderBoardDay(child) {
    const board = document.createElement("section");
    board.className = "board";

    const title = document.createElement("h2");
    title.textContent = child.name;
    board.appendChild(title);

    renderPointsHeader(board, child);

    const dateKey = selectedDateKey();
    const todayEarned = pointsEarnedOnDate(child.id, dateKey);
    const todayLine = document.createElement("p");
    todayLine.className = "today-earned";
    todayLine.textContent = `+${todayEarned} point${todayEarned > 1 ? "s" : ""} ce jour-là`;
    board.appendChild(todayLine);

    const activeHabits = state.habits.filter((h) => h.status === "active");
    if (!activeHabits.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Aucune habitude active. Ouvre le menu ⋮ → Habitudes pour en activer.";
      board.appendChild(empty);
      return board;
    }

    const list = document.createElement("ul");
    list.className = "day-list";

    activeHabits.forEach((habit) => {
      const li = document.createElement("li");
      const occurrences = habit.occurrences || 1;
      const slots = getSlots(child.id, habit.id, dateKey, occurrences);
      const row = document.createElement("div");
      row.className = "day-habit" + (slots.every(Boolean) ? " done" : "") + (occurrences === 1 ? " single" : "");

      if (occurrences === 1) {
        const icon = document.createElement("span");
        icon.className = "state-icon";
        icon.textContent = slots[0] ? "✓" : "";
        row.appendChild(icon);
      }

      const text = document.createElement("span");
      text.className = "habit-text";
      text.textContent = habit.label;
      if (habit.points > 1) {
        const pts = document.createElement("span");
        pts.className = "habit-points";
        pts.textContent = `${habit.points} points`;
        text.appendChild(pts);
      }
      if (habit.note) {
        const note = document.createElement("span");
        note.className = "habit-points";
        note.textContent = habit.note;
        text.appendChild(note);
      }
      row.appendChild(text);

      if (occurrences === 1) {
        row.addEventListener("click", () => {
          setSlot(child, habit, dateKey, 0, !slots[0]);
          render();
        });
      } else {
        const group = document.createElement("div");
        group.className = "slot-group";
        for (let i = 0; i < occurrences; i++) {
          const slotBtn = document.createElement("button");
          slotBtn.type = "button";
          slotBtn.className = "slot-btn" + (slots[i] ? " done" : "");
          slotBtn.textContent = (habit.occurrenceLabels && habit.occurrenceLabels[i]) || String(i + 1);
          slotBtn.addEventListener("click", () => {
            setSlot(child, habit, dateKey, i, !slots[i]);
            render();
          });
          group.appendChild(slotBtn);
        }
        row.appendChild(group);
      }

      li.appendChild(row);

      const streak = currentStreak(child.id, habit);
      if (streak >= MASTERY_STREAK) {
        const banner = document.createElement("div");
        banner.className = "mastery-banner";
        const span = document.createElement("span");
        span.textContent = `🔥 ${streak} jours d'affilée pour ${child.name} !`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = "Marquer maîtrisée";
        btn.addEventListener("click", () => {
          habit.status = "mastered";
          saveData();
          render();
        });
        banner.appendChild(span);
        banner.appendChild(btn);
        li.appendChild(banner);
      }

      list.appendChild(li);
    });

    board.appendChild(list);
    return board;
  }

  function renderBoardWeek(child) {
    const board = document.createElement("section");
    board.className = "board";

    const title = document.createElement("h2");
    title.textContent = child.name;
    board.appendChild(title);

    renderPointsHeader(board, child);

    const todayIdx = (new Date().getDay() + 6) % 7;
    const isCurrentWeek = isViewingCurrentWeek();

    const list = document.createElement("ul");
    list.className = "week-list";

    DAYS.forEach((d, i) => {
      const dayDate = new Date(currentMonday);
      dayDate.setDate(dayDate.getDate() + i);
      const dateKey = toDateKey(dayDate);
      const points = pointsEarnedOnDate(child.id, dateKey);

      const li = document.createElement("li");
      li.className = "week-row" + (isCurrentWeek && i === todayIdx ? " today" : "");
      const dateSpan = document.createElement("span");
      dateSpan.className = "week-row-date";
      dateSpan.textContent = `${d} ${dayDate.getDate()}`;
      const pointsSpan = document.createElement("span");
      pointsSpan.className = "week-row-points";
      pointsSpan.textContent = points > 0 ? `+${points}` : "–";
      li.appendChild(dateSpan);
      li.appendChild(pointsSpan);
      list.appendChild(li);
    });

    board.appendChild(list);
    return board;
  }

  // --- Menu dropdown ---
  const menuToggle = document.getElementById("menu-toggle");
  const menuDropdown = document.getElementById("menu-dropdown");

  function closeMenu() {
    menuDropdown.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }

  menuToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menuDropdown.hidden;
    menuDropdown.hidden = !willOpen;
    menuToggle.setAttribute("aria-expanded", String(willOpen));
  });
  document.addEventListener("click", (e) => {
    if (!menuDropdown.hidden && !menuDropdown.contains(e.target) && e.target !== menuToggle) closeMenu();
  });
  menuDropdown.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", closeMenu);
  });

  // --- Week navigation (display window only — scoring is continuous) ---
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
    selectedDayIndex = (new Date().getDay() + 6) % 7;
    render();
  });

  // --- History dialog ---
  const historyDialog = document.getElementById("history-dialog");

  function renderHistory() {
    const container = document.getElementById("history-content");
    container.innerHTML = "";

    state.children.forEach((child) => {
      const section = document.createElement("div");
      section.className = "history-child";

      const h3 = document.createElement("h3");
      h3.textContent = child.name;
      section.appendChild(h3);

      const stats = document.createElement("p");
      stats.className = "history-stats";
      stats.textContent = `${totalEverEarned(child)} points gagnés au total · ${child.points} disponibles actuellement`;
      section.appendChild(stats);

      if (child.redeemed.length) {
        const table = document.createElement("table");
        table.className = "redeemed-table";
        table.innerHTML = "<thead><tr><th>Date</th><th>Récompense</th><th>Coût</th><th></th></tr></thead>";
        const tbody = document.createElement("tbody");
        child.redeemed.map((r, i) => ({ r, i })).reverse().forEach(({ r, i }) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `<td>${r.date}</td><td>${r.tier === "big" ? "🏆 Grosse" : "🎁 Petite"}</td><td>${r.cost} pts</td>`;
          const actionTd = document.createElement("td");
          const undoBtn = document.createElement("button");
          undoBtn.type = "button";
          undoBtn.className = "btn btn-small btn-ghost";
          undoBtn.textContent = "↩️ Annuler";
          undoBtn.title = "Annuler cet échange et remettre les points";
          undoBtn.addEventListener("click", () => undoRedeem(child, i));
          actionTd.appendChild(undoBtn);
          tr.appendChild(actionTd);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        section.appendChild(table);
      } else {
        const hint = document.createElement("p");
        hint.className = "hint";
        hint.textContent = "Aucune récompense échangée pour l'instant.";
        section.appendChild(hint);
      }

      container.appendChild(section);
    });
  }

  document.getElementById("open-history").addEventListener("click", () => {
    renderHistory();
    historyDialog.showModal();
  });

  // --- Habits dialog ---
  const habitsDialog = document.getElementById("habits-dialog");
  const activeHabitsEl = document.getElementById("habits-active");
  const waitingHabitsEl = document.getElementById("habits-waiting");
  const masteredHabitsEl = document.getElementById("habits-mastered");

  function habitRow(habit, { editable }) {
    const row = document.createElement("div");
    row.className = "habit-row";

    if (editable) {
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = habit.label;
      labelInput.addEventListener("input", () => {
        habit.label = labelInput.value;
        saveData();
      });
      row.appendChild(labelInput);

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
      row.appendChild(pointsInput);

      const occInput = document.createElement("input");
      occInput.type = "number";
      occInput.className = "occurrences-input";
      occInput.min = "1";
      occInput.max = "4";
      occInput.step = "1";
      occInput.title = "Fois par jour";
      occInput.value = habit.occurrences || 1;
      occInput.addEventListener("input", () => {
        habit.occurrences = Math.max(1, Math.min(4, parseInt(occInput.value, 10) || 1));
        saveData();
      });
      row.appendChild(occInput);
    } else {
      const label = document.createElement("span");
      label.textContent = habit.label;
      row.appendChild(label);
      const spacer1 = document.createElement("span");
      row.appendChild(spacer1);
      const spacer2 = document.createElement("span");
      row.appendChild(spacer2);
    }

    const actions = document.createElement("div");
    actions.className = "habit-status-actions";

    if (habit.status === "active") {
      const pauseBtn = document.createElement("button");
      pauseBtn.type = "button";
      pauseBtn.textContent = "⏸ En attente";
      pauseBtn.addEventListener("click", () => {
        habit.status = "waiting";
        saveData();
        renderHabitsDialog();
      });
      actions.appendChild(pauseBtn);

      const masterBtn = document.createElement("button");
      masterBtn.type = "button";
      masterBtn.textContent = "✓ Maîtrisée";
      masterBtn.addEventListener("click", () => {
        habit.status = "mastered";
        saveData();
        renderHabitsDialog();
      });
      actions.appendChild(masterBtn);
    } else if (habit.status === "waiting") {
      const activateBtn = document.createElement("button");
      activateBtn.type = "button";
      activateBtn.textContent = "▶ Activer";
      activateBtn.addEventListener("click", () => {
        habit.status = "active";
        saveData();
        renderHabitsDialog();
      });
      actions.appendChild(activateBtn);
    } else {
      const reactivateBtn = document.createElement("button");
      reactivateBtn.type = "button";
      reactivateBtn.textContent = "↺ Réactiver";
      reactivateBtn.addEventListener("click", () => {
        habit.status = "active";
        saveData();
        renderHabitsDialog();
      });
      actions.appendChild(reactivateBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = "Supprimer";
    removeBtn.addEventListener("click", () => {
      state.habits = state.habits.filter((h) => h.id !== habit.id);
      saveData();
      renderHabitsDialog();
    });
    actions.appendChild(removeBtn);

    row.appendChild(actions);
    return row;
  }

  function renderHabitsDialog() {
    const active = state.habits.filter((h) => h.status === "active");
    const waiting = state.habits.filter((h) => h.status === "waiting");
    const mastered = state.habits.filter((h) => h.status === "mastered");

    activeHabitsEl.innerHTML = "";
    if (active.length > 3) {
      const warn = document.createElement("p");
      warn.className = "hint";
      warn.textContent = `⚠️ ${active.length} habitudes actives — on recommande d'en garder environ 3 à la fois.`;
      activeHabitsEl.appendChild(warn);
    }
    active.forEach((h) => activeHabitsEl.appendChild(habitRow(h, { editable: true })));
    if (!active.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Aucune habitude active pour l'instant.";
      activeHabitsEl.appendChild(empty);
    }

    waitingHabitsEl.innerHTML = "";
    waiting.forEach((h) => waitingHabitsEl.appendChild(habitRow(h, { editable: true })));
    if (!waiting.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Rien en attente.";
      waitingHabitsEl.appendChild(empty);
    }

    masteredHabitsEl.innerHTML = "";
    mastered.forEach((h) => masteredHabitsEl.appendChild(habitRow(h, { editable: false })));
    if (!mastered.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "Aucune habitude maîtrisée pour l'instant.";
      masteredHabitsEl.appendChild(empty);
    }
  }

  document.getElementById("edit-habits").addEventListener("click", () => {
    renderHabitsDialog();
    habitsDialog.showModal();
  });

  document.getElementById("add-habit").addEventListener("click", () => {
    state.habits.push({ id: uid(), label: "Nouvelle habitude", points: 1, occurrences: 1, status: "waiting" });
    saveData();
    renderHabitsDialog();
  });

  habitsDialog.addEventListener("close", render);

  // --- Settings dialog ---
  const settingsDialog = document.getElementById("settings-dialog");
  const childrenList = document.getElementById("children-list");
  const smallThresholdInput = document.getElementById("small-threshold");
  const bigThresholdInput = document.getElementById("big-threshold");
  const surpriseChanceSelect = document.getElementById("surprise-chance");

  function renderChildrenList() {
    childrenList.innerHTML = "";
    state.children.forEach((child, index) => {
      const row = document.createElement("div");
      row.className = "child-row";

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.title = "Couleur du tableau";
      colorInput.value = colorForChild(child, index);
      colorInput.addEventListener("input", () => {
        child.color = colorInput.value;
        saveData();
        render();
      });

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = child.name;
      nameInput.addEventListener("input", () => {
        child.name = nameInput.value;
        saveData();
      });

      const pointsInput = document.createElement("input");
      pointsInput.type = "number";
      pointsInput.min = "0";
      pointsInput.step = "1";
      pointsInput.title = "Solde de points (ajustable manuellement)";
      pointsInput.value = child.points;
      pointsInput.addEventListener("change", () => {
        child.points = Math.max(0, parseInt(pointsInput.value, 10) || 0);
        saveData();
        render();
      });

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

      row.appendChild(colorInput);
      row.appendChild(nameInput);
      row.appendChild(pointsInput);
      row.appendChild(removeBtn);
      childrenList.appendChild(row);
    });
  }

  document.getElementById("open-settings").addEventListener("click", () => {
    renderChildrenList();
    smallThresholdInput.value = state.settings.smallThreshold;
    bigThresholdInput.value = state.settings.bigThreshold;
    surpriseChanceSelect.value = String(state.settings.surpriseChance);
    settingsDialog.showModal();
  });

  document.getElementById("add-child").addEventListener("click", () => {
    state.children.push(defaultChild("Nouvel enfant", PALETTE[state.children.length % PALETTE.length]));
    saveData();
    renderChildrenList();
  });

  smallThresholdInput.addEventListener("change", () => {
    state.settings.smallThreshold = Math.max(1, parseInt(smallThresholdInput.value, 10) || 1);
    saveData();
  });
  bigThresholdInput.addEventListener("change", () => {
    state.settings.bigThreshold = Math.max(state.settings.smallThreshold + 1, parseInt(bigThresholdInput.value, 10) || state.settings.smallThreshold + 1);
    bigThresholdInput.value = state.settings.bigThreshold;
    saveData();
  });
  surpriseChanceSelect.addEventListener("change", () => {
    state.settings.surpriseChance = parseFloat(surpriseChanceSelect.value) || 0;
    saveData();
  });

  document.getElementById("export-data").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `points-enfants-${toDateKey(new Date())}.json`;
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
        if (!parsed.children || !parsed.habits) throw new Error("format invalide");
        state = parsed.version === 2 ? parsed : migrateToV2(parsed);
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

  // --- PWA: offline support + installable on Android ---
  // Auto-reload once a newly installed service worker takes control, so a
  // fresh deploy shows up immediately instead of needing a manual app
  // restart (PWAs can otherwise keep running a stale cached version).
  if ("serviceWorker" in navigator) {
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => {
          reg.update().catch(() => {});
          setInterval(() => reg.update().catch(() => {}), 60 * 1000);
        })
        .catch((err) => console.warn("Service worker non enregistré", err));
    });
  }
})();
