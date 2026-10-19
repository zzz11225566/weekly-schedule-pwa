const STORAGE_KEY = "weekly-schedule-v1";

const DAYS = [
  { key: "mon", label: "周一", short: "一", column: 2, type: "weekday" },
  { key: "tue", label: "周二", short: "二", column: 3, type: "weekday" },
  { key: "wed", label: "周三", short: "三", column: 4, type: "weekday" },
  { key: "thu", label: "周四", short: "四", column: 5, type: "weekday" },
  { key: "fri", label: "周五", short: "五", column: 6, type: "weekday" },
  { key: "sat", label: "周六", short: "六", column: 7, type: "weekend" },
  { key: "sun", label: "周日", short: "日", column: 8, type: "weekend" }
];

const PERIODS = [
  { start: "08:00", end: "09:30", offset: 0 },
  { start: "10:00", end: "11:30", offset: 4 },
  { start: "12:00", end: "13:30", offset: 8 },
  { start: "14:00", end: "15:30", offset: 12 },
  { start: "16:00", end: "17:30", offset: 16 },
  { start: "18:00", end: "19:30", offset: 20 },
  { start: "20:00", end: "21:30", offset: 24 }
];

const CORE_START_MIN = 8 * 60;
const CORE_END_MIN = 21 * 60 + 30;
const CORE_HALF_ROWS = 27;

function emptyPeriod() {
  return { mode: "none", data: {} };
}

function createWeekday() {
  return {
    type: "weekday",
    periods: PERIODS.map(emptyPeriod),
    before: [],
    after: []
  };
}

function createWeekend() {
  return {
    type: "weekend",
    events: [],
    before: [],
    after: []
  };
}

function createDefaultState() {
  const days = {};
  DAYS.forEach((day) => {
    days[day.key] = day.type === "weekday" ? createWeekday() : createWeekend();
  });
  return {
    version: 1,
    settings: {
      theme: "light",
      fontScale: 1
    },
    days,
    extraRows: {
      before: 1,
      after: 1
    }
  };
}

function normalizeDay(rawDay, type) {
  if (!rawDay || typeof rawDay !== "object") {
    return type === "weekday" ? createWeekday() : createWeekend();
  }
  if (type === "weekday") {
    const periods = Array.isArray(rawDay.periods)
      ? PERIODS.map((period, index) => {
          const saved = rawDay.periods[index];
          if (!saved || typeof saved !== "object") return emptyPeriod();
          return {
            mode: saved.mode === "course" || saved.mode === "free" ? saved.mode : "none",
            data:
              saved.data && typeof saved.data === "object"
                ? saved.data
                : {}
          };
        })
      : PERIODS.map(emptyPeriod);
    return {
      type: "weekday",
      periods,
      before: Array.isArray(rawDay.before) ? rawDay.before : [],
      after: Array.isArray(rawDay.after) ? rawDay.after : []
    };
  }
  return {
    type: "weekend",
    events: Array.isArray(rawDay.events) ? rawDay.events : [],
    before: Array.isArray(rawDay.before) ? rawDay.before : [],
    after: Array.isArray(rawDay.after) ? rawDay.after : []
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!raw || typeof raw !== "object") return createDefaultState();
    const days = {};
    DAYS.forEach((day) => {
      days[day.key] = normalizeDay(raw.days?.[day.key], day.type);
    });
    const weekdayKeys = DAYS.filter((day) => day.type === "weekday").map((day) => day.key);
    const existingBefore = Math.max(1, ...weekdayKeys.map((key) => days[key].before.length));
    const existingAfter = Math.max(1, ...weekdayKeys.map((key) => days[key].after.length));
    return {
      version: 1,
      settings: {
        theme: raw.settings?.theme === "dark" ? "dark" : "light",
        fontScale:
          typeof raw.settings?.fontScale === "number"
            ? Math.min(1.25, Math.max(0.85, raw.settings.fontScale))
            : 1
      },
      days,
      extraRows: {
        before: clampRowCount(raw.extraRows?.before ?? existingBefore),
        after: clampRowCount(raw.extraRows?.after ?? existingAfter)
      }
    };
  } catch {
    return createDefaultState();
  }
}

function clampRowCount(value) {
  if (!Number.isFinite(Number(value))) return 1;
  return Math.min(8, Math.max(0, Number(value)));
}

let state = loadState();
let selectedDay = getCurrentDayKey();
let editorContext = null;
let toastTimer = null;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentDayKey() {
  const index = (new Date().getDay() + 6) % 7;
  return DAYS[index].key;
}

function getWeekDates() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  return DAYS.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });
}

function formatTodayLabel() {
  const now = new Date();
  const day = DAYS[(now.getDay() + 6) % 7];
  return `今天 · ${day.label} ${now.getMonth() + 1}月${now.getDate()}日`;
}

function formatDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  if (!month || !day) return dateString;
  return `${Number(month)}月${Number(day)}日`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function timeToMinutes(time) {
  if (!time || typeof time !== "string") return null;
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(minutes) {
  const clamped = Math.max(0, minutes);
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addMinutes(time, amount) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return "09:30";
  return minutesToTime(minutes + amount);
}

function timeToOffset(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return 0;
  const clamped = Math.min(CORE_END_MIN, Math.max(CORE_START_MIN, minutes));
  return Math.round((clamped - CORE_START_MIN) / 30);
}

function normalizeEventTimes(event) {
  let start = event.start || "08:00";
  let end = event.end || addMinutes(start, 90);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null) start = "08:00";
  if (endMinutes === null || endMinutes <= startMinutes) {
    end = addMinutes(start, 90);
  }
  return { start, end };
}

function eventSpan(event) {
  const { start, end } = normalizeEventTimes(event);
  let startOffset = Math.min(CORE_HALF_ROWS - 1, timeToOffset(start));
  let endOffset = Math.min(CORE_HALF_ROWS, timeToOffset(end));
  if (endOffset <= startOffset) endOffset = Math.min(CORE_HALF_ROWS, startOffset + 3);
  return { start, end, startOffset, endOffset };
}

function applySettings() {
  document.documentElement.style.setProperty("--font-scale", String(state.settings.fontScale));
  document.body.classList.toggle("dark", state.settings.theme === "dark");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", state.settings.theme === "dark" ? "#242321" : "#f7f7f5");
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function line(label, value, toneClass, { strong = false, iconName = "" } = {}) {
  if (!value) return "";
  const iconMarkup = iconName ? `${icon(iconName, 13)}` : '<span class="line-dot" aria-hidden="true"></span>';
  return `<div class="card-line ${toneClass}">${iconMarkup}<span>${strong ? "<strong>" : ""}${escapeHtml(label)}${escapeHtml(value)}${strong ? "</strong>" : ""}</span></div>`;
}

function hasExtraContent(item) {
  if (!item) return false;
  return Boolean(item.title || item.location || item.date);
}

function renderBlankCell(action, attrs = "") {
  return `<div class="slot-card blank-cell" role="button" tabindex="0" data-action="${action}" ${attrs}></div>`;
}

function renderPeriodCard(dayKey, periodIndex) {
  const day = state.days[dayKey];
  const period = day.periods[periodIndex];
  const data = period.data || {};
  const time = PERIODS[periodIndex];

  if (period.mode === "none") {
    return renderBlankCell("open-period", `data-day="${dayKey}" data-period="${periodIndex}"`);
  }

  const isCourse = period.mode === "course";
  const taskOpen = data.taskOpen === true;
  const taskLines = data.task
    ? data.task
        .split("\n")
        .map((task) => task.trim())
        .filter(Boolean)
        .map((task) => `<div class="card-line tone-orange"><span class="line-dot" aria-hidden="true"></span><span>${escapeHtml(task)}</span></div>`)
        .join("")
    : "";

  const courseLines = isCourse
    ? `${line("", data.course || "未填写课程", "tone-blue", { strong: true })}
       ${line("", data.location, "tone-green", { iconName: "pin" })}
       ${data.task ? `<div class="task-wrap">${taskLines}</div><button class="task-toggle" type="button" data-action="toggle-task" data-day="${dayKey}" data-period="${periodIndex}" aria-expanded="${taskOpen}">任务 ${taskOpen ? "收起" : "展开"}</button>` : ""}`
    : `${line("", data.title || "未填写安排", "tone-brown", { strong: true })}
       ${line("", data.location, "tone-blue", { iconName: "pin" })}
       ${line("", formatDate(data.date), "tone-gray", { iconName: "calendar" })}`;

  return `<div class="slot-card ${isCourse ? "course" : "free"}${data.task ? " has-tasks" : ""}" role="button" tabindex="0" data-action="open-period" data-day="${dayKey}" data-period="${periodIndex}" data-tasks-open="${taskOpen}">
    <span class="card-tag">${isCourse ? "有课" : "无课"}</span>
    ${line("", `${time.start}-${time.end}`, "tone-gray", { iconName: "clock" })}
    ${courseLines}
  </div>`;
}

function renderExtraCard(dayKey, slot, index) {
  const item = state.days[dayKey][slot][index];
  const slotLabel = slot === "before" ? "课前待办" : "课后待办";
  return `<div class="slot-card extra" role="button" tabindex="0" data-action="open-extra" data-day="${dayKey}" data-slot="${slot}" data-index="${index}">
    <span class="card-tag">${slotLabel}</span>
    ${line("", item.title || "未填写待办", "tone-green", { strong: true })}
    ${line("", item.location, "tone-blue", { iconName: "pin" })}
    ${line("", formatDate(item.date), "tone-gray", { iconName: "calendar" })}
  </div>`;
}

function renderExtraCell(dayKey, slot, index) {
  const item = state.days[dayKey][slot]?.[index];
  return hasExtraContent(item)
    ? renderExtraCard(dayKey, slot, index)
    : renderBlankCell("open-extra", `data-day="${dayKey}" data-slot="${slot}" data-index="${index}"`);
}

function renderEventCard(dayKey, index) {
  const event = state.days[dayKey].events[index];
  const timeText = event.start || event.end ? `${event.start || "未填"}-${event.end || "未填"}` : "时间未填";
  return `<div class="slot-card event" role="button" tabindex="0" data-action="open-weekend" data-day="${dayKey}" data-index="${index}">
    <span class="card-tag">活动</span>
    ${line("", timeText, "tone-orange", { iconName: "clock" })}
    ${line("", event.content || "未填写内容", "tone-brown", { strong: true })}
    ${line("", event.location, "tone-blue", { iconName: "pin" })}
    ${line("", formatDate(event.date), "tone-gray", { iconName: "calendar" })}
  </div>`;
}

function renderGrid() {
  const weekDates = getWeekDates();
  const beforeRows = clampRowCount(state.extraRows.before);
  const afterRows = clampRowCount(state.extraRows.after);
  const coreStartRow = 2 + beforeRows;
  const coreRows = CORE_HALF_ROWS;
  const afterStartRow = coreStartRow + coreRows;
  const grid = document.querySelector("#weekGrid");
  const rowTracks = ["48px"];
  if (beforeRows > 0) rowTracks.push(`repeat(${beforeRows}, minmax(46px, auto))`);
  rowTracks.push(`repeat(${coreRows}, minmax(32px, auto))`);
  if (afterRows > 0) rowTracks.push(`repeat(${afterRows}, minmax(46px, auto))`);
  grid.style.gridTemplateRows = rowTracks.join(" ");

  const parts = [];
  parts.push(`<div class="grid-head corner"><span>时间</span></div>`);
  DAYS.forEach((day, index) => {
    const isToday = day.key === getCurrentDayKey();
    const addButton =
      day.type === "weekend"
        ? `<button class="head-add" type="button" data-action="open-weekend" data-day="${day.key}" data-index="-1" aria-label="新增${day.label}活动">${icon("plus", 14)}</button>`
        : "";
    parts.push(`
      <div class="grid-head ${isToday ? "active" : ""}" data-day="${day.key}" style="grid-column:${day.column};grid-row:1;">
        <span class="head-day">${day.label}</span>
        <span class="head-date">${weekDates[index]}</span>
        ${addButton}
      </div>
    `);
  });

  for (let row = 0; row < beforeRows; row += 1) {
    const rowLine = coreStartRow - beforeRows + row;
    parts.push(`<div class="day-spacer" style="grid-column:1;grid-row:${rowLine} / ${rowLine + 1}"><span class="section-ribbon">课前</span></div>`);
    DAYS.forEach((day) => {
      const baseClass = day.type === "weekend" ? "grid-cell weekend" : "grid-cell";
      parts.push(`<div class="${baseClass}" style="grid-column:${day.column};grid-row:${rowLine} / ${rowLine + 1}"></div>`);
      parts.push(`<div style="grid-column:${day.column};grid-row:${rowLine} / ${rowLine + 1};z-index:1;">${renderExtraCell(day.key, "before", row)}</div>`);
    });
  }

  for (let row = 0; row < coreRows; row += 1) {
    const rowLine = coreStartRow + row;
    const minutes = CORE_START_MIN + row * 30;
    if (row % 2 === 0) {
      parts.push(`<div class="time-label" style="grid-column:1;grid-row:${rowLine} / ${rowLine + 2};">${minutesToTime(minutes)}</div>`);
    }
    DAYS.forEach((day) => {
      const isToday = day.key === getCurrentDayKey();
      const classNames = ["grid-cell"];
      if (day.type === "weekend") classNames.push("weekend");
      if (isToday) classNames.push("today");
      const isGap = day.type === "weekday" && !PERIODS.some((period) => row >= period.offset && row < period.offset + 3);
      if (isGap) classNames.push("period-gap");
      parts.push(`<div class="${classNames.join(" ")}" style="grid-column:${day.column};grid-row:${rowLine} / ${rowLine + 1};"></div>`);
    });
  }

  DAYS.forEach((day) => {
    if (day.type === "weekday") {
      state.days[day.key].periods.forEach((period, periodIndex) => {
        const periodMeta = PERIODS[periodIndex];
        const startLine = coreStartRow + periodMeta.offset;
        const endLine = startLine + 3;
        parts.push(`<div style="grid-column:${day.column};grid-row:${startLine} / ${endLine};z-index:1;">${renderPeriodCard(day.key, periodIndex)}</div>`);
      });
    } else {
      state.days[day.key].events.forEach((event, index) => {
        const span = eventSpan(event);
        const startLine = coreStartRow + span.startOffset;
        const endLine = coreStartRow + span.endOffset;
        parts.push(`<div style="grid-column:${day.column};grid-row:${startLine} / ${endLine};z-index:1;">${renderEventCard(day.key, index)}</div>`);
      });
    }
  });

  for (let row = 0; row < afterRows; row += 1) {
    const rowLine = afterStartRow + row;
    parts.push(`<div class="day-spacer" style="grid-column:1;grid-row:${rowLine} / ${rowLine + 1}"><span class="section-ribbon">课后</span></div>`);
    DAYS.forEach((day) => {
      const baseClass = day.type === "weekend" ? "grid-cell weekend" : "grid-cell";
      parts.push(`<div class="${baseClass}" style="grid-column:${day.column};grid-row:${rowLine} / ${rowLine + 1}"></div>`);
      parts.push(`<div style="grid-column:${day.column};grid-row:${rowLine} / ${rowLine + 1};z-index:1;">${renderExtraCell(day.key, "after", row)}</div>`);
    });
  }

  grid.innerHTML = parts.join("");
  requestAnimationFrame(() => scrollToDay(selectedDay, false));
}

function renderDayStrip() {
  const strip = document.querySelector("#dayStrip");
  strip.innerHTML = DAYS.map((day) => {
    const count =
      day.type === "weekday"
        ? state.days[day.key].periods.filter((period) => period.mode !== "none").length +
          state.days[day.key].before.length +
          state.days[day.key].after.length
        : state.days[day.key].events.length +
          state.days[day.key].before.length +
          state.days[day.key].after.length;
    return `<button class="day-pill ${day.key === selectedDay ? "active" : ""}" type="button" data-day="${day.key}" aria-label="${day.label}，${count}项安排">
      ${day.label}<span>${count || "空"}</span>
    </button>`;
  }).join("");
}

function renderSettingsPanel() {
  const themeButtons = document.querySelectorAll("#themeSwitch button");
  themeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === state.settings.theme);
  });
  const range = document.querySelector("#fontRange");
  range.value = String(state.settings.fontScale);
}

function renderToolbar() {
  const before = clampRowCount(state.extraRows.before);
  const after = clampRowCount(state.extraRows.after);
  document.querySelector("#beforeCount").textContent = String(before);
  document.querySelector("#afterCount").textContent = String(after);
  document.querySelector("#beforeMinus").disabled = before <= 0;
  document.querySelector("#afterMinus").disabled = after <= 0;
  document.querySelector("#beforePlus").disabled = before >= 8;
  document.querySelector("#afterPlus").disabled = after >= 8;
}

function setExtraRowCount(slot, delta) {
  const current = clampRowCount(state.extraRows[slot]);
  const next = clampRowCount(current + delta);
  state.extraRows[slot] = next;
  DAYS.forEach((day) => {
    const rows = state.days[day.key][slot];
    while (rows.length < next) rows.push({ title: "", location: "", date: "" });
    if (rows.length > next) rows.length = next;
  });
  saveState();
  renderAll();
}

function renderAll() {
  applySettings();
  document.querySelector("#todayLabel").textContent = formatTodayLabel();
  renderDayStrip();
  renderToolbar();
  renderGrid();
  renderSettingsPanel();
}

function scrollToDay(dayKey, smooth = true) {
  selectedDay = dayKey;
  document.querySelectorAll(".day-pill").forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.day === dayKey);
  });
  document.querySelectorAll(".grid-head[data-day]").forEach((head) => {
    head.classList.toggle("active", head.dataset.day === dayKey);
  });
  const head = document.querySelector(`.grid-head[data-day="${dayKey}"]`);
  if (head) {
    head.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest", inline: "center" });
  }
  const pill = document.querySelector(`.day-pill[data-day="${dayKey}"]`);
  if (pill) {
    pill.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest", inline: "center" });
  }
}

function openEditor(context) {
  editorContext = context;
  const overlay = document.querySelector("#sheetOverlay");
  const content = document.querySelector("#editorContent");
  overlay.hidden = false;
  content.innerHTML = buildEditorForm(context);
  const firstInput = content.querySelector("input, textarea");
  if (firstInput) setTimeout(() => firstInput.focus(), 80);
}

function buildEditorForm(context) {
  const existing = getContextItem(context);
  const isNew = context.index === -1 || (context.kind === "period" && existing?.mode === "none");
  const title = getEditorTitle(context, isNew);
  const mode =
    context.mode ||
    (existing?.mode && existing.mode !== "none" ? existing.mode : "course");
  const data = existing?.data || existing || {};

  const periodSwitch =
    context.kind === "period"
      ? `<div class="field"><label>单元格类型</label>
          <div class="segmented" id="modeSwitch" role="group" aria-label="单元格类型">
            <button type="button" class="${mode === "course" ? "active" : ""}" data-mode="course">有课</button>
            <button type="button" class="${mode === "free" ? "active" : ""}" data-mode="free">无课</button>
          </div>
        </div>`
      : "";

  let fields = "";
  if (context.kind === "period" && mode === "course") {
    fields = `
      <div class="field"><label for="f-course">课程名称</label><input id="f-course" name="course" value="${escapeHtml(data.course || "")}" /></div>
      <div class="field"><label for="f-location">上课地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-task">任务</label><textarea id="f-task" name="task">${escapeHtml(data.task || "")}</textarea></div>
    `;
  } else if (context.kind === "period" && mode === "free") {
    fields = `
      <div class="field"><label for="f-title">安排</label><input id="f-title" name="title" value="${escapeHtml(data.title || "")}" /></div>
      <div class="field"><label for="f-location">地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-date">日期</label><input id="f-date" name="date" type="date" value="${escapeHtml(data.date || "")}" /></div>
    `;
  } else if (context.kind === "extra") {
    fields = `
      <div class="field"><label for="f-title">待办内容</label><input id="f-title" name="title" value="${escapeHtml(data.title || "")}" /></div>
      <div class="field"><label for="f-location">地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-date">日期</label><input id="f-date" name="date" type="date" value="${escapeHtml(data.date || "")}" /></div>
    `;
  } else if (context.kind === "weekend") {
    fields = `
      <div class="field"><label for="f-date">日期</label><input id="f-date" name="date" type="date" value="${escapeHtml(data.date || "")}" /></div>
      <div class="field-row">
        <div class="field"><label for="f-start">开始时间</label><input id="f-start" name="start" type="time" value="${escapeHtml(data.start || "09:00")}" /></div>
        <div class="field"><label for="f-end">结束时间</label><input id="f-end" name="end" type="time" value="${escapeHtml(data.end || "10:30")}" /></div>
      </div>
      <div class="field"><label for="f-content">内容</label><input id="f-content" name="content" value="${escapeHtml(data.content || "")}" /></div>
      <div class="field"><label for="f-location">地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
    `;
  }

  const deleteButton = isNew
    ? ""
    : `<button class="sheet-button danger" type="button" id="deleteBtn">${icon("trash")}删除</button>`;

  return `
    <div class="sheet-head">
      <div>
        <p class="eyebrow">${getEditorEyebrow(context)}</p>
        <h2 id="editorTitle">${escapeHtml(title)}</h2>
      </div>
      <button class="icon-btn" type="button" id="closeEditor" aria-label="关闭编辑">${icon("close")}</button>
    </div>
    <form id="editorForm" class="field-list">
      ${periodSwitch}
      ${fields}
      <div class="sheet-actions">
        ${deleteButton}
        <button class="sheet-button primary" type="submit">保存</button>
      </div>
    </form>
  `;
}

function getContextItem(context) {
  const day = state.days[context.day];
  if (context.kind === "period") return day.periods[context.period];
  if (context.kind === "extra") return day[context.slot][context.index];
  if (context.kind === "weekend") return day.events[context.index];
  return null;
}

function getEditorEyebrow(context) {
  const dayLabel = DAYS.find((item) => item.key === context.day).label;
  if (context.kind === "period") {
    return `${dayLabel} · ${PERIODS[context.period].start}-${PERIODS[context.period].end}`;
  }
  if (context.kind === "extra") {
    return `${dayLabel} · ${context.slot === "before" ? "课前待办" : "课后待办"}`;
  }
  return `${dayLabel} · 周末活动`;
}

function getEditorTitle(context, isNew) {
  if (context.kind === "period") return isNew ? "添加安排" : "编辑安排";
  if (context.kind === "extra") return isNew ? "添加待办" : "编辑待办";
  return isNew ? "添加活动" : "编辑活动";
}

function closeEditor() {
  const overlay = document.querySelector("#sheetOverlay");
  overlay.hidden = true;
  editorContext = null;
}

function saveEditor() {
  if (!editorContext) return;
  const context = editorContext;
  const form = document.querySelector("#editorForm");
  const formData = new FormData(form);
  const day = state.days[context.day];

  if (context.kind === "period") {
    const mode = document.querySelector("#modeSwitch .active")?.dataset.mode || "course";
    day.periods[context.period] = {
      mode,
      data: {
        course: String(formData.get("course") || "").trim(),
        location: String(formData.get("location") || "").trim(),
        task: String(formData.get("task") || "").trim(),
        title: String(formData.get("title") || "").trim(),
        date: String(formData.get("date") || ""),
        taskOpen: day.periods[context.period]?.data?.taskOpen === true
      }
    };
  } else if (context.kind === "extra") {
    const item = {
      title: String(formData.get("title") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      date: String(formData.get("date") || "")
    };
    if (context.index === -1) {
      day[context.slot].push(item);
    } else {
      day[context.slot][context.index] = item;
    }
  } else if (context.kind === "weekend") {
    const item = {
      date: String(formData.get("date") || ""),
      start: String(formData.get("start") || ""),
      end: String(formData.get("end") || ""),
      content: String(formData.get("content") || "").trim(),
      location: String(formData.get("location") || "").trim()
    };
    if (context.index === -1) {
      day.events.push(item);
    } else {
      day.events[context.index] = item;
    }
  }

  saveState();
  closeEditor();
  renderAll();
  showToast("已保存");
}

function deleteEditorItem() {
  if (!editorContext) return;
  const context = editorContext;
  const day = state.days[context.day];
  if (context.kind === "period") {
    day.periods[context.period] = emptyPeriod();
  } else if (context.kind === "extra") {
    day[context.slot].splice(context.index, 1);
  } else if (context.kind === "weekend") {
    day.events.splice(context.index, 1);
  }
  saveState();
  closeEditor();
  renderAll();
  showToast("已删除");
}

function bindEvents() {
  document.querySelector("#settingsBtn").addEventListener("click", () => {
    document.querySelector("#settingsOverlay").hidden = false;
    renderSettingsPanel();
  });
  document.querySelector("#closeSettings").addEventListener("click", () => {
    document.querySelector("#settingsOverlay").hidden = true;
  });

  document.querySelectorAll(".overlay").forEach((overlay) => {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        overlay.hidden = true;
        if (overlay.id === "sheetOverlay") editorContext = null;
      }
    });
  });

  document.querySelector("#dayStrip").addEventListener("click", (event) => {
    const button = event.target.closest("[data-day]");
    if (button) scrollToDay(button.dataset.day);
  });

  document.querySelector("#beforePlus").addEventListener("click", () => setExtraRowCount("before", 1));
  document.querySelector("#beforeMinus").addEventListener("click", () => setExtraRowCount("before", -1));
  document.querySelector("#afterPlus").addEventListener("click", () => setExtraRowCount("after", 1));
  document.querySelector("#afterMinus").addEventListener("click", () => setExtraRowCount("after", -1));

  document.querySelector("#weekGrid").addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action, day, period, slot, index } = actionTarget.dataset;

    if (action === "open-weekend" && actionTarget.classList.contains("head-add")) {
      openEditor({ kind: "weekend", day, index: Number(index) });
    } else if (action === "toggle-task") {
      event.stopPropagation();
      const periodData = state.days[day].periods[Number(period)].data;
      periodData.taskOpen = !(periodData.taskOpen === true);
      saveState();
      renderAll();
    }
  });

  document.querySelector("#weekGrid").addEventListener("dblclick", (event) => {
    if (event.target.closest(".task-toggle") || event.target.closest(".head-add")) return;
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action, day, period, slot, index } = actionTarget.dataset;
    if (action === "open-period") {
      openEditor({ kind: "period", day, period: Number(period) });
    } else if (action === "open-extra") {
      openEditor({ kind: "extra", day, slot, index: Number(index) });
    } else if (action === "open-weekend") {
      openEditor({ kind: "weekend", day, index: Number(index) });
    }
  });

  document.querySelector("#weekGrid").addEventListener("keydown", (event) => {
    const card = event.target.closest('.slot-card[role="button"]');
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });

  document.querySelector("#editorContent").addEventListener("click", (event) => {
    if (event.target.closest("#closeEditor")) {
      closeEditor();
      return;
    }
    if (event.target.closest("#deleteBtn")) {
      deleteEditorItem();
      return;
    }
    const modeButton = event.target.closest('#modeSwitch button[data-mode]');
    if (modeButton) {
      editorContext.mode = modeButton.dataset.mode;
      const content = document.querySelector("#editorContent");
      content.innerHTML = buildEditorForm(editorContext);
    }
  });

  document.querySelector("#editorContent").addEventListener("submit", (event) => {
    if (event.target.id === "editorForm") {
      event.preventDefault();
      saveEditor();
    }
  });

  document.querySelector("#themeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-theme]");
    if (!button) return;
    state.settings.theme = button.dataset.theme;
    saveState();
    applySettings();
    renderSettingsPanel();
  });

  document.querySelector("#fontRange").addEventListener("input", (event) => {
    state.settings.fontScale = Number(event.target.value);
    applySettings();
  });

  document.querySelector("#fontRange").addEventListener("change", () => {
    saveState();
    showToast("字号已调整");
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

bindEvents();
renderAll();
registerServiceWorker();
