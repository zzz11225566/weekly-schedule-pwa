const STORAGE_KEY = "weekly-schedule-v1";

const DAYS = [
  { key: "mon", label: "周一", short: "一", type: "weekday" },
  { key: "tue", label: "周二", short: "二", type: "weekday" },
  { key: "wed", label: "周三", short: "三", type: "weekday" },
  { key: "thu", label: "周四", short: "四", type: "weekday" },
  { key: "fri", label: "周五", short: "五", type: "weekday" },
  { key: "sat", label: "周六", short: "六", type: "weekend" },
  { key: "sun", label: "周日", short: "日", type: "weekend" }
];

const PERIODS = [
  { start: "08:00", end: "09:30", offset: 4 },
  { start: "10:00", end: "11:30", offset: 8 },
  { start: "12:00", end: "13:30", offset: 12 },
  { start: "14:00", end: "15:30", offset: 16 },
  { start: "16:00", end: "17:30", offset: 20 },
  { start: "18:00", end: "19:30", offset: 24 },
  { start: "20:00", end: "21:30", offset: 28 }
];

const CORE_START_MIN = 6 * 60;
const CORE_END_MIN = 23 * 60;
const CORE_HALF_ROWS = 34;

const COLORS = [
  { id: "blue", name: "蓝" },
  { id: "green", name: "绿" },
  { id: "orange", name: "橙" },
  { id: "red", name: "红" },
  { id: "purple", name: "紫" },
  { id: "teal", name: "青" },
  { id: "yellow", name: "黄" },
  { id: "pink", name: "粉" },
  { id: "gray", name: "灰" }
];

function emptyPeriod() {
  return { mode: "none", data: {} };
}

function createWeekday() {
  return {
    type: "weekday",
    periods: PERIODS.map(emptyPeriod),
    todos: []
  };
}

function createWeekend() {
  return {
    type: "weekend",
    events: []
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
      fontScale: 1,
      viewScale: 1
    },
    days
  };
}

function legacyExtrasToTodos(rawDay) {
  const todos = [];
  (Array.isArray(rawDay?.before) ? rawDay.before : []).forEach((item) => {
    todos.push({
      title: item.title || "",
      location: item.location || "",
      date: item.date || "",
      start: item.start || "06:00",
      end: item.end || "08:00",
      color: item.color || "green"
    });
  });
  (Array.isArray(rawDay?.after) ? rawDay.after : []).forEach((item) => {
    todos.push({
      title: item.title || "",
      location: item.location || "",
      date: item.date || "",
      start: item.start || "21:30",
      end: item.end || "23:00",
      color: item.color || "orange"
    });
  });
  return todos;
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
            data: saved.data && typeof saved.data === "object" ? saved.data : {}
          };
        })
      : PERIODS.map(emptyPeriod);
    return {
      type: "weekday",
      periods,
      todos: Array.isArray(rawDay.todos) ? rawDay.todos : legacyExtrasToTodos(rawDay)
    };
  }
  return {
    type: "weekend",
    events: Array.isArray(rawDay.events) ? rawDay.events : []
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
    return {
      version: 1,
      settings: {
        theme: raw.settings?.theme === "dark" ? "dark" : "light",
        fontScale: clampSetting(raw.settings?.fontScale, 0.85, 1.25, 1),
        viewScale: clampSetting(raw.settings?.viewScale, 0.2, 1.5, 1)
      },
      days
    };
  } catch {
    return createDefaultState();
  }
}

function clampSetting(value, min, max, fallback) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
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
  if (minutes === null) return "07:30";
  return minutesToTime(minutes + amount);
}

function timeToOffset(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return 0;
  const clamped = Math.min(CORE_END_MIN, Math.max(CORE_START_MIN, minutes));
  return Math.round((clamped - CORE_START_MIN) / 30);
}

function normalizeInterval(item, defaultStart = "06:00", defaultDuration = 90) {
  let start = item?.start || defaultStart;
  let end = item?.end || addMinutes(start, defaultDuration);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null) start = defaultStart;
  if (endMinutes === null || endMinutes <= startMinutes) {
    end = addMinutes(start, defaultDuration);
  }
  return { start, end };
}

function itemSpan(item, defaultStart = "06:00", defaultDuration = 90) {
  const { start, end } = normalizeInterval(item, defaultStart, defaultDuration);
  let startOffset = Math.min(CORE_HALF_ROWS - 1, timeToOffset(start));
  let endOffset = Math.min(CORE_HALF_ROWS, timeToOffset(end));
  if (endOffset <= startOffset) endOffset = Math.min(CORE_HALF_ROWS, startOffset + 3);
  return { start, end, startOffset, endOffset };
}

function assignLanes(items) {
  const lanes = [];
  return items.map((item, index) => {
    const span = itemSpan(item);
    const startMinutes = timeToMinutes(span.start);
    const endMinutes = timeToMinutes(span.end);
    let lane = lanes.findIndex((intervals) =>
      intervals.every((interval) => interval.end <= startMinutes || interval.start >= endMinutes)
    );
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push({ start: startMinutes, end: endMinutes });
    return { ...item, index, ...span, lane, startMinutes, endMinutes };
  });
}

function applySettings() {
  document.documentElement.style.setProperty("--font-scale", String(state.settings.fontScale));
  document.documentElement.style.setProperty("--ui-zoom", String(state.settings.viewScale));
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

function colorClass(color, fallback) {
  return COLORS.some((item) => item.id === color) ? `color-${color}` : fallback;
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

  return `<div class="slot-card ${isCourse ? "course" : "free"} ${colorClass(data.color, isCourse ? "course" : "free")}${data.task ? " has-tasks" : ""}" role="button" tabindex="0" data-action="open-period" data-day="${dayKey}" data-period="${periodIndex}" data-tasks-open="${taskOpen}">
    <span class="card-tag">${isCourse ? "有课" : "无课"}</span>
    ${line("", `${time.start}-${time.end}`, "tone-gray", { iconName: "clock" })}
    ${courseLines}
  </div>`;
}

function renderTodoCard(dayKey, index, lane = 0) {
  const item = state.days[dayKey].todos[index];
  if (!item) return "";
  const span = itemSpan(item);
  const timeText = item.start || item.end ? `${item.start || "未填"}-${item.end || "未填"}` : "时间未填";
  return `<div class="slot-card todo ${colorClass(item.color, "todo")}" role="button" tabindex="0" data-action="open-todo" data-day="${dayKey}" data-index="${index}" style="grid-column:${lane + 1};grid-row:${span.startOffset + 1} / ${span.endOffset + 1};">
    <span class="card-tag">待办</span>
    ${line("", timeText, "tone-orange", { iconName: "clock" })}
    ${line("", item.title || "未填写待办", "tone-green", { strong: true })}
    ${line("", item.location, "tone-blue", { iconName: "pin" })}
    ${line("", formatDate(item.date), "tone-gray", { iconName: "calendar" })}
  </div>`;
}

function renderEventCard(dayKey, index, lane = 0) {
  const event = state.days[dayKey].events[index];
  if (!event) return "";
  const span = itemSpan(event, "06:00", 90);
  const timeText = event.start || event.end ? `${event.start || "未填"}-${event.end || "未填"}` : "时间未填";
  return `<div class="slot-card event ${colorClass(event.color, "event")}" role="button" tabindex="0" data-action="open-weekend" data-day="${dayKey}" data-index="${index}" style="grid-column:${lane + 1};grid-row:${span.startOffset + 1} / ${span.endOffset + 1};">
    <span class="card-tag">活动</span>
    ${line("", timeText, "tone-orange", { iconName: "clock" })}
    ${line("", event.content || "未填写内容", "tone-brown", { strong: true })}
    ${line("", event.location, "tone-blue", { iconName: "pin" })}
    ${line("", formatDate(event.date), "tone-gray", { iconName: "calendar" })}
  </div>`;
}

function renderTimeControls() {
  return `<div class="time-controls">
    <button class="todo-add-button" type="button" data-action="open-todo-new">${icon("plus", 14)} 待办</button>
  </div>`;
}

function renderGrid() {
  const weekDates = getWeekDates();
  const coreStartRow = 2;
  const coreRows = CORE_HALF_ROWS;
  const afterStartRow = coreStartRow + coreRows;

  const weekdayDays = DAYS.filter((day) => day.type === "weekday");
  const weekendDays = DAYS.filter((day) => day.type === "weekend");
  const weekendLayouts = {};
  weekendDays.forEach((day) => {
    const items = state.days[day.key].events.map((event, index) => ({ ...event, index }));
    weekendLayouts[day.key] = assignLanes(items);
  });
  const todoLayouts = {};
  weekdayDays.forEach((day) => {
    const items = state.days[day.key].todos.map((todo, index) => ({ ...todo, index }));
    todoLayouts[day.key] = assignLanes(items);
  });

  const satLanes = Math.max(1, weekendLayouts.sat.length ? Math.max(...weekendLayouts.sat.map((item) => item.lane + 1)) : 1);
  const sunLanes = Math.max(1, weekendLayouts.sun.length ? Math.max(...weekendLayouts.sun.map((item) => item.lane + 1)) : 1);
  const columns = ["84px"];
  weekdayDays.forEach(() => columns.push("minmax(132px, 1fr)"));
  if (satLanes > 1) {
    columns.push(`repeat(${satLanes}, minmax(132px, 1fr))`);
  } else {
    columns.push("minmax(132px, 1fr)");
  }
  if (sunLanes > 1) {
    columns.push(`repeat(${sunLanes}, minmax(132px, 1fr))`);
  } else {
    columns.push("minmax(132px, 1fr)");
  }

  const satStart = 7;
  const sunStart = satStart + satLanes;
  const grid = document.querySelector("#weekGrid");
  grid.style.gridTemplateColumns = columns.join(" ");
  grid.style.minWidth = window.innerWidth >= 720 ? "0px" : `${84 + (5 + satLanes + sunLanes) * 132}px`;
  grid.style.gridTemplateRows = ["64px", `repeat(${coreRows}, minmax(32px, auto))`].join(" ");

  const parts = [];
  parts.push(`<div class="grid-head corner">${renderTimeControls()}</div>`);

  weekdayDays.forEach((day) => {
    const col = 2 + weekdayDays.indexOf(day);
    const isToday = day.key === getCurrentDayKey();
    parts.push(`
      <div class="grid-head ${isToday ? "active" : ""}" data-day="${day.key}" style="grid-column:${col};grid-row:1;">
        <span class="head-day">${day.label}</span>
        <span class="head-date">${weekDates[DAYS.indexOf(day)]}</span>
      </div>
    `);
  });

  weekendDays.forEach((day) => {
    const lanes = day.key === "sat" ? satLanes : sunLanes;
    const col = day.key === "sat" ? satStart : sunStart;
    const isToday = day.key === getCurrentDayKey();
    parts.push(`
      <div class="grid-head ${isToday ? "active" : ""}" data-day="${day.key}" style="grid-column:${col} / span ${lanes};grid-row:1;">
        <span class="head-day">${day.label}</span>
        <span class="head-date">${weekDates[DAYS.indexOf(day)]}</span>
        <button class="head-add" type="button" data-action="open-weekend" data-day="${day.key}" data-index="-1" aria-label="新增${day.label}活动">${icon("plus", 14)}</button>
      </div>
    `);
  });

  for (let row = 0; row < coreRows; row += 1) {
    const rowLine = coreStartRow + row;
    const minutes = CORE_START_MIN + row * 30;
    if (row % 2 === 0) {
      parts.push(`<div class="time-label" style="grid-column:1;grid-row:${rowLine} / ${rowLine + 2};">${minutesToTime(minutes)}</div>`);
    }
    weekdayDays.forEach((day) => {
      const col = 2 + weekdayDays.indexOf(day);
      const isToday = day.key === getCurrentDayKey();
      const classNames = ["grid-cell"];
      if (isToday) classNames.push("today");
      const isGap = !PERIODS.some((period) => row >= period.offset && row < period.offset + 3);
      if (isGap) classNames.push("period-gap");
      if (PERIODS.some((period) => row === period.offset + 2)) classNames.push("period-end");
      parts.push(`<div class="${classNames.join(" ")}" style="grid-column:${col};grid-row:${rowLine} / ${rowLine + 1};"></div>`);
    });
  }

  weekdayDays.forEach((day) => {
    const col = 2 + weekdayDays.indexOf(day);
    state.days[day.key].periods.forEach((period, periodIndex) => {
      const meta = PERIODS[periodIndex];
      const startLine = coreStartRow + meta.offset;
      const endLine = startLine + 3;
      parts.push(`<div style="grid-column:${col};grid-row:${startLine} / ${endLine};z-index:1;">${renderPeriodCard(day.key, periodIndex)}</div>`);
    });

    const layout = todoLayouts[day.key];
    if (layout.length) {
      const lanes = Math.max(1, ...layout.map((item) => item.lane + 1));
      const todoCards = layout.map((item) => renderTodoCard(day.key, item.index, item.lane)).join("");
      parts.push(`
        <div class="weekday-todo-layer" style="grid-column:${col};grid-row:${coreStartRow} / ${afterStartRow};z-index:3;">
          <div class="todo-subgrid" style="grid-template-columns:repeat(${lanes}, minmax(0, 1fr));grid-template-rows:repeat(${coreRows}, minmax(32px, auto));">${todoCards}</div>
        </div>
      `);
    }
  });

  weekendDays.forEach((day) => {
    const lanes = day.key === "sat" ? satLanes : sunLanes;
    const col = day.key === "sat" ? satStart : sunStart;
    const layout = weekendLayouts[day.key];
    const cards = layout.map((item) => renderEventCard(day.key, item.index, item.lane)).join("");
    parts.push(`
      <div class="weekend-day-panel" style="grid-column:${col} / span ${lanes};grid-row:${coreStartRow} / ${afterStartRow};z-index:2;">
        <div class="weekend-subgrid" style="grid-template-columns:repeat(${lanes}, minmax(0, 1fr));grid-template-rows:repeat(${coreRows}, minmax(32px, auto));">${cards}</div>
      </div>
    `);
  });

  grid.innerHTML = parts.join("");
  requestAnimationFrame(() => scrollToDay(selectedDay, false));
}

function renderDayStrip() {
  const strip = document.querySelector("#dayStrip");
  strip.innerHTML = DAYS.map((day) => {
    const dayData = state.days[day.key];
    const count =
      day.type === "weekday"
        ? dayData.periods.filter((period) => period.mode !== "none").length + dayData.todos.length
        : dayData.events.length;
    return `<button class="day-pill ${day.key === selectedDay ? "active" : ""}" type="button" data-day="${day.key}" aria-label="${day.label}，${count}项安排">
      ${day.label}<span>${count || "空"}</span>
    </button>`;
  }).join("");
}

function renderSettingsPanel() {
  document.querySelectorAll("#themeSwitch button").forEach((button) => {
    button.classList.toggle("active", button.dataset.theme === state.settings.theme);
  });
  document.querySelector("#fontRange").value = String(state.settings.fontScale);
  document.querySelector("#zoomRange").value = String(state.settings.viewScale);
  document.querySelector("#zoomValue").textContent = `${Math.round(state.settings.viewScale * 100)}%`;
}

function renderAll() {
  applySettings();
  document.querySelector("#todayLabel").textContent = formatTodayLabel();
  renderDayStrip();
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
  const firstInput = content.querySelector("input, textarea, select");
  if (firstInput) setTimeout(() => firstInput.focus(), 80);
}

function colorPickerHtml(selected) {
  return `<div class="field"><label>颜色</label>
    <div class="color-picker" role="radiogroup" aria-label="颜色">
      ${COLORS.map((color) => `<label class="color-swatch ${color.id}" title="${color.name}">
        <input type="radio" name="color" value="${color.id}" ${selected === color.id ? "checked" : ""} />
        <span></span>
      </label>`).join("")}
    </div>
  </div>`;
}

function weekdayOptions(selectedDay) {
  return DAYS.filter((day) => day.type === "weekday").map((day) => `<option value="${day.key}" ${day.key === selectedDay ? "selected" : ""}>${day.label}</option>`).join("");
}

function buildEditorForm(context) {
  const existing = getContextItem(context);
  const isNew = context.index === -1 || (context.kind === "period" && existing?.mode === "none");
  const title = getEditorTitle(context, isNew);
  const mode = context.mode || (existing?.mode && existing.mode !== "none" ? existing.mode : "course");
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
      ${colorPickerHtml(data.color || "blue")}
    `;
  } else if (context.kind === "period" && mode === "free") {
    fields = `
      <div class="field"><label for="f-title">安排</label><input id="f-title" name="title" value="${escapeHtml(data.title || "")}" /></div>
      <div class="field"><label for="f-location">地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-date">日期</label><input id="f-date" name="date" type="date" value="${escapeHtml(data.date || "")}" /></div>
      ${colorPickerHtml(data.color || "teal")}
    `;
  } else if (context.kind === "todo") {
    const selectedDay = context.day || "mon";
    fields = `
      <div class="field"><label for="f-day">星期</label><select id="f-day" name="day">${weekdayOptions(selectedDay)}</select></div>
      <div class="field"><label for="f-title">待办内容</label><input id="f-title" name="title" value="${escapeHtml(data.title || "")}" /></div>
      <div class="field"><label for="f-location">地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-date">日期</label><input id="f-date" name="date" type="date" value="${escapeHtml(data.date || "")}" /></div>
      <div class="field-row">
        <div class="field"><label for="f-start">开始时间</label><input id="f-start" name="start" type="time" value="${escapeHtml(data.start || "")}" /></div>
        <div class="field"><label for="f-end">结束时间</label><input id="f-end" name="end" type="time" value="${escapeHtml(data.end || "")}" /></div>
      </div>
      ${colorPickerHtml(data.color || "green")}
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
      ${colorPickerHtml(data.color || "orange")}
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
  if (context.kind === "todo") return day.todos[context.index];
  if (context.kind === "weekend") return day.events[context.index];
  return null;
}

function getEditorEyebrow(context) {
  const dayLabel = DAYS.find((item) => item.key === context.day)?.label || "";
  if (context.kind === "period") {
    return `${dayLabel} · ${PERIODS[context.period].start}-${PERIODS[context.period].end}`;
  }
  if (context.kind === "todo") {
    return `${dayLabel} · 待办`;
  }
  return `${dayLabel} · 周末活动`;
}

function getEditorTitle(context, isNew) {
  if (context.kind === "period") return isNew ? "添加安排" : "编辑安排";
  if (context.kind === "todo") return isNew ? "添加待办" : "编辑待办";
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
        color: String(formData.get("color") || "blue"),
        taskOpen: day.periods[context.period]?.data?.taskOpen === true
      }
    };
  } else if (context.kind === "todo") {
    const targetDay = String(formData.get("day") || context.day);
    const item = {
      title: String(formData.get("title") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      date: String(formData.get("date") || ""),
      start: String(formData.get("start") || ""),
      end: String(formData.get("end") || ""),
      color: String(formData.get("color") || "green")
    };
    if (context.index === -1) {
      state.days[targetDay].todos.push(item);
    } else if (targetDay === context.day) {
      state.days[targetDay].todos[context.index] = item;
    } else {
      state.days[context.day].todos.splice(context.index, 1);
      state.days[targetDay].todos.push(item);
    }
  } else if (context.kind === "weekend") {
    const item = {
      date: String(formData.get("date") || ""),
      start: String(formData.get("start") || ""),
      end: String(formData.get("end") || ""),
      content: String(formData.get("content") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      color: String(formData.get("color") || "orange")
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
  } else if (context.kind === "todo") {
    day.todos.splice(context.index, 1);
  } else if (context.kind === "weekend") {
    day.events.splice(context.index, 1);
  }
  saveState();
  closeEditor();
  renderAll();
  showToast("已删除");
}

function bindEvents() {
  document.querySelector("#shareBtn").addEventListener("click", async () => {
    const shareData = {
      title: "七日课表",
      text: "一个可以离线使用的七日课表，支持 iPhone 和 Android。",
      url: window.location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User may cancel sharing.
      }
    }
    try {
      await navigator.clipboard.writeText(shareData.url);
      showToast("链接已复制");
    } catch {
      showToast("请复制浏览器地址栏链接分享");
    }
  });

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

  document.querySelector("#weekGrid").addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const { action, day, period, index } = actionTarget.dataset;
    if (action === "open-todo-new") {
      const defaultDay = DAYS.find((item) => item.key === selectedDay && item.type === "weekday") ? selectedDay : "mon";
      openEditor({ kind: "todo", day: defaultDay, index: -1 });
    } else if (action === "open-weekend" && actionTarget.classList.contains("head-add")) {
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
    const { action, day, period, index } = actionTarget.dataset;
    if (action === "open-period") {
      openEditor({ kind: "period", day, period: Number(period) });
    } else if (action === "open-todo") {
      openEditor({ kind: "todo", day, index: Number(index) });
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

  document.querySelector("#zoomRange").addEventListener("input", (event) => {
    state.settings.viewScale = Number(event.target.value);
    applySettings();
    renderSettingsPanel();
  });

  document.querySelector("#zoomRange").addEventListener("change", () => {
    saveState();
    showToast("缩放已调整");
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
