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
const TIME_COLUMN_PX = 84;
const LANE_PX = 132;

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

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyPeriod() {
  return { mode: "none", data: {} };
}

function createWeekday() {
  return { type: "weekday", periods: PERIODS.map(emptyPeriod), todos: [] };
}

function createWeekend() {
  return { type: "weekend", events: [] };
}

function createDefaultState() {
  const days = {};
  DAYS.forEach((day) => {
    days[day.key] = day.type === "weekday" ? createWeekday() : createWeekend();
  });
  return {
    version: 3,
    settings: {
      theme: "light",
      fontScale: 1,
      viewScale: 1,
      firstWeekDate: null,
      showUnselectedCourses: true,
      showUnselectedTodos: true,
      memo: ""
    },
    week: 1,
    days,
    courses: []
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
      color: item.color || "green",
      weeks: null
    });
  });
  (Array.isArray(rawDay?.after) ? rawDay.after : []).forEach((item) => {
    todos.push({
      title: item.title || "",
      location: item.location || "",
      date: item.date || "",
      start: item.start || "21:30",
      end: item.end || "23:00",
      color: item.color || "orange",
      weeks: null
    });
  });
  return todos;
}

function normalizeWeeks(weeks) {
  if (!weeks || weeks.type === "all") return null;
  if (weeks.type === "range") {
    const start = Number(weeks.start);
    const end = Number(weeks.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { type: "range", start: Math.max(1, start), end: Math.max(start, end) };
  }
  return null;
}

function parseWeekRange(startValue, endValue) {
  const startText = String(startValue ?? "").trim();
  const endText = String(endValue ?? "").trim();
  if (!startText && !endText) return null;
  const start = Number(startText);
  const end = Number(endText);
  if (!Number.isFinite(start) && !Number.isFinite(end)) return null;
  const startWeek = Number.isFinite(start) ? Math.max(1, start) : 1;
  const endWeek = Number.isFinite(end) ? Math.max(startWeek, end) : startWeek;
  return { type: "range", start: startWeek, end: endWeek };
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
    const todos = Array.isArray(rawDay.todos) ? rawDay.todos : legacyExtrasToTodos(rawDay);
    return {
      type: "weekday",
      periods,
      todos: todos.map((todo) => ({ ...todo, weeks: normalizeWeeks(todo.weeks) }))
    };
  }
  return { type: "weekend", events: Array.isArray(rawDay.events) ? rawDay.events : [] };
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
      version: 3,
      settings: {
        theme: raw.settings?.theme === "dark" ? "dark" : "light",
        fontScale: clampSetting(raw.settings?.fontScale, 0.85, 1.25, 1),
        viewScale: clampSetting(raw.settings?.viewScale, 0.2, 1.5, 1),
        firstWeekDate: raw.settings?.firstWeekDate || null,
        showUnselectedCourses: raw.settings?.showUnselectedCourses !== false,
        showUnselectedTodos: raw.settings?.showUnselectedTodos !== false,
        memo: raw.settings?.memo || ""
      },
      week: Number(raw.week) || 1,
      days,
      courses: Array.isArray(raw.courses) ? raw.courses : []
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
let courseEditorContext = null;
let courseDraftOccurrences = [];
let toastTimer = null;
let pinchState = null;

if (!state.settings.firstWeekDate) {
  state.settings.firstWeekDate = mondayISO(new Date());
  state.week = 1;
  saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function mondayISO(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return toISODate(copy);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseISODate(value) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getCurrentDayKey() {
  const index = (new Date().getDay() + 6) % 7;
  return DAYS[index].key;
}

function getWeekDateRange(week = state.week) {
  const firstMonday = parseISODate(state.settings.firstWeekDate);
  if (!firstMonday) return null;
  const monday = new Date(firstMonday);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return DAYS.map((_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

function getWeekDates() {
  const range = getWeekDateRange();
  if (!range) return DAYS.map(() => "");
  return range.map((date) => `${date.getMonth() + 1}/${date.getDate()}`);
}

function getCurrentWeekNumber() {
  const firstMonday = parseISODate(state.settings.firstWeekDate);
  if (!firstMonday) return 1;
  const todayMonday = new Date();
  todayMonday.setHours(0, 0, 0, 0);
  todayMonday.setDate(todayMonday.getDate() - ((todayMonday.getDay() + 6) % 7));
  const diff = Math.round((todayMonday - firstMonday) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function weekLabel(week = state.week) {
  const range = getWeekDateRange(week);
  if (!range) return `第 ${week} 周`;
  const first = range[0];
  const last = range[6];
  return `第 ${week} 周 · ${first.getMonth() + 1}/${first.getDate()}-${last.getMonth() + 1}/${last.getDate()}`;
}

function formatTodayLabel() {
  const now = new Date();
  const day = DAYS[(now.getDay() + 6) % 7];
  return `${weekLabel(getCurrentWeekNumber())} · 今天 ${now.getMonth() + 1}月${now.getDate()}日`;
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

function intervalSpan(start, end) {
  let startOffset = Math.min(CORE_HALF_ROWS - 1, timeToOffset(start));
  let endOffset = Math.min(CORE_HALF_ROWS, timeToOffset(end));
  if (endOffset <= startOffset) endOffset = Math.min(CORE_HALF_ROWS, startOffset + 3);
  return { start, end, startOffset, endOffset };
}

function normalizeInterval(item, defaultStart = "06:00", defaultDuration = 90) {
  let start = item?.start || defaultStart;
  let end = item?.end || addMinutes(start, defaultDuration);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null) start = defaultStart;
  if (endMinutes === null || endMinutes <= startMinutes) end = addMinutes(start, defaultDuration);
  return { start, end };
}

function itemSpan(item, defaultStart = "06:00", defaultDuration = 90) {
  const { start, end } = normalizeInterval(item, defaultStart, defaultDuration);
  return intervalSpan(start, end);
}

function periodSpan(dayKey, periodIndex) {
  const period = state.days[dayKey].periods[periodIndex];
  const meta = PERIODS[periodIndex];
  const data = period.data || {};
  if (data.endMode === "mergeNext" && PERIODS[periodIndex + 1]) {
    return intervalSpan(meta.start, PERIODS[periodIndex + 1].end);
  }
  if (data.endMode === "custom" && data.customEnd) {
    return intervalSpan(meta.start, data.customEnd);
  }
  return intervalSpan(meta.start, meta.end);
}

function assignLanes(items) {
  const lanes = [];
  return items.map((item, position) => {
    const span = item.span || itemSpan(item);
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
    return { ...item, index: item.index ?? position, ...span, lane, startMinutes, endMinutes };
  });
}

function weeksInclude(weeks, week) {
  if (!weeks || weeks.type === "all") return true;
  if (weeks.type === "range") return week >= weeks.start && week <= weeks.end;
  return true;
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

function zoomBounds() {
  const container = document.querySelector("#weekScroller")?.clientWidth || window.innerWidth;
  const grid = document.querySelector("#weekGrid");
  const defaultWidth = Number(grid?.dataset.defaultWidth) || TIME_COLUMN_PX + 5 * LANE_PX;
  const fullWidth = Number(grid?.dataset.fullWidth) || TIME_COLUMN_PX + 7 * LANE_PX;
  const defaultScale = Math.min(1.5, Math.max(0.2, container / defaultWidth));
  const minScale = Math.min(1.5, Math.max(0.2, container / fullWidth));
  return { defaultScale, minScale: Math.min(defaultScale, minScale) };
}

function setViewScale(value, { persist = false } = {}) {
  const { minScale } = zoomBounds();
  state.settings.viewScale = Math.round(Math.min(1.5, Math.max(minScale, Number(value) || 1)) * 1000) / 1000;
  document.documentElement.style.setProperty("--ui-zoom", String(state.settings.viewScale));
  const range = document.querySelector("#zoomRange");
  const label = document.querySelector("#zoomValue");
  if (range) {
    range.min = String(minScale);
    range.max = "1.5";
    range.value = String(state.settings.viewScale);
  }
  if (label) label.textContent = `${Math.round(state.settings.viewScale * 100)}%`;
  if (persist) saveState();
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

function renderPeriodCard(dayKey, periodIndex, lane = 0, dashed = false) {
  const day = state.days[dayKey];
  const period = day.periods[periodIndex];
  const data = period.data || {};
  const time = PERIODS[periodIndex];
  const span = periodSpan(dayKey, periodIndex);

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

  const teacherLine = isCourse && data.showTeacher ? line("", data.teacher, "tone-gray", { iconName: "more" }) : "";
  const courseLines = isCourse
    ? `${line("", data.course || "未填写课程", "tone-blue", { strong: true })}
       ${teacherLine}
       ${line("", data.location, "tone-green", { iconName: "pin" })}
       ${data.task ? `<div class="task-wrap">${taskLines}</div><button class="task-toggle" type="button" data-action="toggle-task" data-day="${dayKey}" data-period="${periodIndex}" aria-expanded="${taskOpen}">任务 ${taskOpen ? "收起" : "展开"}</button>` : ""}`
    : `${line("", data.title || "未填写安排", "tone-brown", { strong: true })}
       ${line("", data.location, "tone-blue", { iconName: "pin" })}
       ${line("", formatDate(data.date), "tone-gray", { iconName: "calendar" })}`;

  return `<div class="slot-card ${isCourse ? "course" : "free"} ${colorClass(data.color, isCourse ? "course" : "free")}${dashed ? " dashed" : ""}${data.task ? " has-tasks" : ""}" role="button" tabindex="0" data-action="open-period" data-day="${dayKey}" data-period="${periodIndex}" data-tasks-open="${taskOpen}" style="grid-column:${lane + 1};grid-row:${span.startOffset + 1} / ${span.endOffset + 1};">
    <span class="card-tag">${isCourse ? "有课" : "无课"}</span>
    ${line("", `${time.start}-${data.endMode === "mergeNext" ? PERIODS[periodIndex + 1].end : data.endMode === "custom" ? data.customEnd || time.end : time.end}`, "tone-gray", { iconName: "clock" })}
    ${courseLines}
  </div>`;
}

function renderTodoCard(dayKey, index, lane = 0, dashed = false) {
  const item = state.days[dayKey].todos[index];
  if (!item) return "";
  const span = itemSpan(item);
  const timeText = item.start || item.end ? `${item.start || "未填"}-${item.end || "未填"}` : "时间未填";
  return `<div class="slot-card todo ${colorClass(item.color, "todo")}${dashed ? " dashed" : ""}" role="button" tabindex="0" data-action="open-todo" data-day="${dayKey}" data-index="${index}" style="grid-column:${lane + 1};grid-row:${span.startOffset + 1} / ${span.endOffset + 1};">
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
  const weekdayLayouts = {};

  weekdayDays.forEach((day) => {
    const blocks = [];
    state.days[day.key].periods.forEach((period, periodIndex) => {
      if (period.mode === "none") return;
      if (periodIndex > 0 && state.days[day.key].periods[periodIndex - 1].data?.endMode === "mergeNext") return;
      const span = periodSpan(day.key, periodIndex);
      const visible = weeksInclude(period.data?.weeks, state.week);
      if (!visible && !state.settings.showUnselectedCourses) return;
      blocks.push({ kind: "period", index: periodIndex, span, start: span.start, end: span.end, dashed: !visible });
    });
    state.days[day.key].todos.forEach((todo, index) => {
      const span = itemSpan(todo);
      const visible = weeksInclude(todo.weeks, state.week);
      if (!visible && !state.settings.showUnselectedTodos) return;
      blocks.push({ kind: "todo", index, span, start: span.start, end: span.end, dashed: !visible });
    });
    weekdayLayouts[day.key] = assignLanes(blocks);
  });

  const weekendLayouts = {};
  weekendDays.forEach((day) => {
    const items = state.days[day.key].events.map((event, index) => ({ ...event, index }));
    weekendLayouts[day.key] = assignLanes(items);
  });

  const laneCount = (layout) => Math.max(1, layout.length ? Math.max(...layout.map((item) => item.lane + 1)) : 1);
  const weekdayLanes = {};
  weekdayDays.forEach((day) => {
    weekdayLanes[day.key] = laneCount(weekdayLayouts[day.key]);
  });
  const satLanes = laneCount(weekendLayouts.sat);
  const sunLanes = laneCount(weekendLayouts.sun);

  const columns = [`${TIME_COLUMN_PX}px`];
  weekdayDays.forEach((day) => {
    const lanes = weekdayLanes[day.key];
    columns.push(lanes > 1 ? `repeat(${lanes}, minmax(${LANE_PX}px, 1fr))` : `minmax(${LANE_PX}px, 1fr)`);
  });
  columns.push(satLanes > 1 ? `repeat(${satLanes}, minmax(${LANE_PX}px, 1fr))` : `minmax(${LANE_PX}px, 1fr)`);
  columns.push(sunLanes > 1 ? `repeat(${sunLanes}, minmax(${LANE_PX}px, 1fr))` : `minmax(${LANE_PX}px, 1fr)`);

  let nextColumn = 2;
  const weekdayColumns = {};
  weekdayDays.forEach((day) => {
    weekdayColumns[day.key] = nextColumn;
    nextColumn += weekdayLanes[day.key];
  });
  const satStart = nextColumn;
  const sunStart = satStart + satLanes;
  const weekdayLaneTotal = weekdayDays.reduce((sum, day) => sum + weekdayLanes[day.key], 0);
  const totalDayLanes = weekdayLaneTotal + satLanes + sunLanes;

  const grid = document.querySelector("#weekGrid");
  grid.style.gridTemplateColumns = columns.join(" ");
  grid.dataset.defaultWidth = String(TIME_COLUMN_PX + weekdayLaneTotal * LANE_PX);
  grid.dataset.fullWidth = String(TIME_COLUMN_PX + totalDayLanes * LANE_PX);
  grid.style.minWidth = window.innerWidth >= 720 ? "0px" : `${TIME_COLUMN_PX + totalDayLanes * LANE_PX}px`;
  grid.style.gridTemplateRows = ["64px", `repeat(${coreRows}, minmax(44px, auto))`].join(" ");

  const parts = [];
  parts.push(`<div class="grid-head corner">${renderTimeControls()}</div>`);

  weekdayDays.forEach((day) => {
    const col = weekdayColumns[day.key];
    const lanes = weekdayLanes[day.key];
    const isToday = day.key === getCurrentDayKey();
    parts.push(`
      <div class="grid-head ${isToday ? "active" : ""}" data-day="${day.key}" style="grid-column:${col} / span ${lanes};grid-row:1;">
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
      const col = weekdayColumns[day.key];
      const lanes = weekdayLanes[day.key];
      const classNames = ["grid-cell"];
      if (day.key === getCurrentDayKey()) classNames.push("today");
      if (!PERIODS.some((period) => row >= period.offset && row < period.offset + 3)) classNames.push("period-gap");
      if (PERIODS.some((period) => row === period.offset)) classNames.push("period-start");
      if (PERIODS.some((period) => row === period.offset + 2)) classNames.push("period-end");
      parts.push(`<div class="${classNames.join(" ")}" style="grid-column:${col} / span ${lanes};grid-row:${rowLine} / ${rowLine + 1};"></div>`);
    });
  }

  weekdayDays.forEach((day) => {
    const col = weekdayColumns[day.key];
    const lanes = weekdayLanes[day.key];
    const layout = weekdayLayouts[day.key];
    const cards = layout
      .map((item) =>
        item.kind === "period"
          ? renderPeriodCard(day.key, item.index, item.lane, item.dashed)
          : renderTodoCard(day.key, item.index, item.lane, item.dashed)
      )
      .join("");
    const blankCards = PERIODS.map((meta, periodIndex) => {
      if (state.days[day.key].periods[periodIndex].mode !== "none") return "";
      if (periodIndex > 0 && state.days[day.key].periods[periodIndex - 1].data?.endMode === "mergeNext") return "";
      return `<div style="grid-column:1;grid-row:${meta.offset + 1} / ${meta.offset + 4};">${renderBlankCell("open-period", `data-day="${day.key}" data-period="${periodIndex}"`)}</div>`;
    }).join("");
    parts.push(`
      <div class="weekday-day-panel" style="grid-column:${col} / span ${lanes};grid-row:${coreStartRow} / ${afterStartRow};z-index:2;">
        <div class="weekday-subgrid" style="grid-template-columns:repeat(${lanes}, minmax(0, 1fr));grid-template-rows:repeat(${coreRows}, minmax(44px, auto));">${cards}${blankCards}</div>
      </div>
    `);
  });

  weekendDays.forEach((day) => {
    const lanes = day.key === "sat" ? satLanes : sunLanes;
    const col = day.key === "sat" ? satStart : sunStart;
    const cards = weekendLayouts[day.key].map((item) => renderEventCard(day.key, item.index, item.lane)).join("");
    parts.push(`
      <div class="weekend-day-panel" style="grid-column:${col} / span ${lanes};grid-row:${coreStartRow} / ${afterStartRow};z-index:2;">
        <div class="weekend-subgrid" style="grid-template-columns:repeat(${lanes}, minmax(0, 1fr));grid-template-rows:repeat(${coreRows}, minmax(44px, auto));">${cards}</div>
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
  document.querySelector("#unselectedCourses").checked = state.settings.showUnselectedCourses;
  document.querySelector("#unselectedTodos").checked = state.settings.showUnselectedTodos;
  setViewScale(state.settings.viewScale);
  document.querySelector("#zoomValue").textContent = `${Math.round(state.settings.viewScale * 100)}%`;
}

function renderWeekPanel() {
  const current = getCurrentWeekNumber();
  const first = state.settings.firstWeekDate || mondayISO(new Date());
  const options = [];
  for (let week = 1; week <= 24; week += 1) {
    options.push(`<option value="${week}" ${week === state.week ? "selected" : ""}>${weekLabel(week)}</option>`);
  }
  document.querySelector("#weekBody").innerHTML = `
    <div class="week-field"><label for="firstWeekDate">第一周周一</label><input id="firstWeekDate" type="date" value="${first}" /></div>
    <div class="week-field"><label for="currentWeek">当前查看周</label><select id="currentWeek">${options.join("")}</select></div>
    <div class="week-note">未选择第一周时，默认以开始使用这一周为第一周。</div>
  `;
  document.querySelector("#firstWeekDate").addEventListener("change", (event) => {
    state.settings.firstWeekDate = event.target.value || mondayISO(new Date());
    state.week = 1;
    saveState();
    renderWeekPanel();
    renderAll();
  });
  document.querySelector("#currentWeek").addEventListener("change", (event) => {
    state.week = Number(event.target.value);
    saveState();
    renderAll();
  });
}

function renderCoursesPanel() {
  const body = document.querySelector("#coursesBody");
  if (!state.courses.length) {
    body.innerHTML = `<button class="course-empty" type="button" data-action="new-course">${icon("plus", 28)}<span>新增课程</span></button>`;
  } else {
    const rows = state.courses
      .map(
        (course, index) => `
          <button class="course-row" type="button" data-action="edit-course" data-index="${index}">
            <span class="course-row-color ${colorClass(course.color, "blue")}"></span>
            <span class="course-row-main">
              <strong>${escapeHtml(course.name || "未命名课程")}</strong>
              <small>${escapeHtml(course.teacher && course.showTeacher ? course.teacher + " · " : "")}${escapeHtml(course.location || "")}</small>
              <small>${escapeHtml(courseTimeText(course))}</small>
            </span>
          </button>
        `
      )
      .join("");
    body.innerHTML = `
      <div class="courses-list">${rows}</div>
      <button class="course-add-button" type="button" data-action="new-course">${icon("plus", 16)} 新增课程</button>
    `;
  }
}

function courseTimeText(course) {
  const weeks = course.weeks ? `${course.weeks.start}-${course.weeks.end}周` : "每周";
  const parts = courseOccurrences(course)
    .map(({ day, period }) => {
      const dayLabel = DAYS.find((item) => item.key === day)?.label || day;
      const meta = PERIODS[period];
      return meta ? `${dayLabel} ${meta.start}-${meta.end}` : dayLabel;
    })
    .filter(Boolean);
  return `${weeks} · ${parts.join(" · ") || "未排节次"}`;
}

function courseOccurrences(course) {
  if (Array.isArray(course.occurrences) && course.occurrences.length) {
    return course.occurrences;
  }
  return (course.days || []).flatMap((day) =>
    (course.periods || []).map((period) => ({ day, period }))
  );
}

function renderAll() {
  applySettings();
  document.querySelector("#todayLabel").textContent = formatTodayLabel();
  renderDayStrip();
  renderGrid();
  renderSettingsPanel();
  renderCoursesPanel();
  renderWeekPanel();
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
  if (head) head.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest", inline: "center" });
  const pill = document.querySelector(`.day-pill[data-day="${dayKey}"]`);
  if (pill) pill.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest", inline: "center" });
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

function periodOptions(selected) {
  return PERIODS.map((period, index) => `<option value="${index}" ${selected?.includes(index) ? "selected" : ""}>${period.start}-${period.end}</option>`).join("");
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
    const presetId = data.courseId || "";
    const presetOptions = ['<option value="">手动填写</option>'].concat(
      state.courses.map((course) => `<option value="${course.id}" ${course.id === presetId ? "selected" : ""}>${escapeHtml(course.name || "未命名课程")}</option>`)
    ).join("");
    const endMode = data.endMode || "default";
    fields = `
      <div class="field"><label for="f-preset">填入已有课程</label><select id="f-preset" name="preset">${presetOptions}</select></div>
      <div class="field"><label for="f-course">课程名称</label><input id="f-course" name="course" value="${escapeHtml(data.course || "")}" /></div>
      <div class="field-row">
        <div class="field"><label for="f-teacher">教师</label><input id="f-teacher" name="teacher" value="${escapeHtml(data.teacher || "")}" /></div>
        <label class="switch-row"><input type="checkbox" id="f-showTeacher" name="showTeacher" ${data.showTeacher ? "checked" : ""} /><span>显示教师</span></label>
      </div>
      <div class="field"><label for="f-location">上课地点</label><input id="f-location" name="location" value="${escapeHtml(data.location || "")}" /></div>
      <div class="field"><label for="f-task">任务</label><textarea id="f-task" name="task">${escapeHtml(data.task || "")}</textarea></div>
      <div class="field-row">
        <div class="field"><label for="f-week-start">起始周</label><input id="f-week-start" name="weekStart" type="number" min="1" value="${escapeHtml(data.weeks?.start || "")}" /></div>
        <div class="field"><label for="f-week-end">结束周</label><input id="f-week-end" name="weekEnd" type="number" min="1" value="${escapeHtml(data.weeks?.end || "")}" /></div>
      </div>
      <div class="field"><label>下课时间</label>
        <div class="segmented" id="endModeSwitch" role="group" aria-label="下课时间">
          <button type="button" class="${endMode === "default" ? "active" : ""}" data-end-mode="default">默认</button>
          <button type="button" class="${endMode === "mergeNext" ? "active" : ""}" data-end-mode="mergeNext">下节课连上</button>
          <button type="button" class="${endMode === "custom" ? "active" : ""}" data-end-mode="custom">自定义</button>
        </div>
      </div>
      <div class="field" id="customEndField" ${endMode === "custom" ? "" : "hidden"}><label for="f-customEnd">自定义下课时间</label><input id="f-customEnd" name="customEnd" type="time" value="${escapeHtml(data.customEnd || "")}" /></div>
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
      <div class="field-row">
        <div class="field"><label for="f-week-start">起始周</label><input id="f-week-start" name="weekStart" type="number" min="1" value="${escapeHtml(data.weeks?.start || "")}" /></div>
        <div class="field"><label for="f-week-end">结束周</label><input id="f-week-end" name="weekEnd" type="number" min="1" value="${escapeHtml(data.weeks?.end || "")}" /></div>
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

  const deleteButton = isNew ? "" : `<button class="sheet-button danger" type="button" id="deleteBtn">${icon("trash")}删除</button>`;

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
      <div class="sheet-actions">${deleteButton}<button class="sheet-button primary" type="submit">保存</button></div>
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
  if (context.kind === "period") return `${dayLabel} · ${PERIODS[context.period].start}-${PERIODS[context.period].end}`;
  if (context.kind === "todo") return `${dayLabel} · 待办`;
  return `${dayLabel} · 周末活动`;
}

function getEditorTitle(context, isNew) {
  if (context.kind === "period") return isNew ? "添加安排" : "编辑安排";
  if (context.kind === "todo") return isNew ? "添加待办" : "编辑待办";
  return isNew ? "添加活动" : "编辑活动";
}

function closeEditor() {
  document.querySelector("#sheetOverlay").hidden = true;
  editorContext = null;
}

function saveEditor() {
  if (!editorContext) return;
  const context = editorContext;
  const form = document.querySelector("#editorForm");
  const formData = new FormData(form);
  const day = state.days[context.day];

  if (context.kind === "period") {
    const previousCourseId = day.periods[context.period]?.data?.courseId || null;
    const mode = document.querySelector("#modeSwitch .active")?.dataset.mode || "course";
    const endMode = document.querySelector("#endModeSwitch .active")?.dataset.endMode || "default";
    const customEnd = String(formData.get("customEnd") || "").trim();
    if (endMode === "custom" && !customEnd) {
      showToast("自定义下课时间必填");
      return;
    }
    const weeks = parseWeekRange(formData.get("weekStart"), formData.get("weekEnd"));
    const presetId = String(formData.get("preset") || "");
    const preset = presetId ? state.courses.find((course) => course.id === presetId) : null;
    const data = {
      course: String(formData.get("course") || "").trim(),
      teacher: String(formData.get("teacher") || "").trim(),
      showTeacher: formData.get("showTeacher") === "on",
      location: String(formData.get("location") || "").trim(),
      task: String(formData.get("task") || "").trim(),
      title: "",
      date: "",
      color: String(formData.get("color") || "blue"),
      weeks,
      endMode,
      customEnd,
      courseId: mode === "course" ? presetId || previousCourseId || null : null,
      taskOpen: day.periods[context.period]?.data?.taskOpen === true
    };
    if (preset) {
      data.course = preset.name;
      data.teacher = preset.teacher;
      data.showTeacher = preset.showTeacher;
      data.location = preset.location;
      data.color = preset.color;
      data.weeks = preset.weeks;
    }
    day.periods[context.period] = { mode, data };
    if (previousCourseId && previousCourseId !== data.courseId) {
      removeCourseOccurrence(previousCourseId, context.day, context.period);
    }
    if (mode === "course") syncCourseFromCell(context.day, context.period, data);
    if (endMode === "mergeNext" && PERIODS[context.period + 1]) {
      const next = day.periods[context.period + 1];
      if (next?.data?.courseId) removeCourseOccurrence(next.data.courseId, context.day, context.period + 1);
      day.periods[context.period + 1] = emptyPeriod();
    }
  } else if (context.kind === "todo") {
    const targetDay = String(formData.get("day") || context.day);
    const item = {
      title: String(formData.get("title") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      date: String(formData.get("date") || ""),
      start: String(formData.get("start") || ""),
      end: String(formData.get("end") || ""),
      color: String(formData.get("color") || "green"),
      weeks: parseWeekRange(formData.get("weekStart"), formData.get("weekEnd"))
    };
    if (context.index === -1) state.days[targetDay].todos.push(item);
    else if (targetDay === context.day) state.days[targetDay].todos[context.index] = item;
    else {
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
    if (context.index === -1) day.events.push(item);
    else day.events[context.index] = item;
  }

  saveState();
  closeEditor();
  renderAll();
  showToast("已保存");
}

function syncCourseFromCell(dayKey, periodIndex, data) {
  if (!data.courseId) {
    if (data.course) {
      const course = {
        id: makeId(),
        name: data.course,
        teacher: data.teacher,
        showTeacher: data.showTeacher,
        location: data.location,
        color: data.color,
        weeks: data.weeks,
        days: [dayKey],
        periods: [periodIndex],
        occurrences: [{ day: dayKey, period: periodIndex }]
      };
      state.courses.push(course);
      state.days[dayKey].periods[periodIndex].data.courseId = course.id;
    }
    return;
  }
  const course = state.courses.find((item) => item.id === data.courseId);
  if (!course) return;
  course.name = data.course || course.name;
  course.teacher = data.teacher;
  course.showTeacher = data.showTeacher;
  course.location = data.location;
  course.color = data.color;
  course.weeks = data.weeks;
  if (!Array.isArray(course.occurrences)) course.occurrences = courseOccurrences(course);
  if (!course.occurrences.some((item) => item.day === dayKey && item.period === periodIndex)) {
    course.occurrences.push({ day: dayKey, period: periodIndex });
  }
  if (!course.days.includes(dayKey)) course.days.push(dayKey);
  if (!course.periods.includes(periodIndex)) course.periods.push(periodIndex);
  applyCourseToDays(course);
}

function applyCourseToDays(course) {
  const occurrences = courseOccurrences(course);
  DAYS.filter((day) => day.type === "weekday").forEach((day) => {
    state.days[day.key].periods.forEach((period, periodIndex) => {
      if (period.data?.courseId === course.id) {
        const wanted = occurrences.some((item) => item.day === day.key && item.period === periodIndex);
        if (!wanted) {
          state.days[day.key].periods[periodIndex] = emptyPeriod();
        }
      }
    });
  });
  occurrences.forEach(({ day, period }) => {
    const previous = state.days[day].periods[period].data || {};
    if (previous.courseId && previous.courseId !== course.id) {
      removeCourseOccurrence(previous.courseId, day, period);
    }
    state.days[day].periods[period] = {
      mode: "course",
      data: {
        course: course.name,
        teacher: course.teacher,
        showTeacher: course.showTeacher,
        location: course.location,
        color: course.color,
        weeks: course.weeks,
        courseId: course.id,
        task: previous.task || "",
        taskOpen: previous.taskOpen === true,
        endMode: previous.endMode || "default",
        customEnd: previous.customEnd || ""
      }
    };
  });
}

function deleteEditorItem() {
  if (!editorContext) return;
  const context = editorContext;
  const day = state.days[context.day];
  if (context.kind === "period") {
    const courseId = day.periods[context.period].data?.courseId;
    const wasMerged = day.periods[context.period].data?.endMode === "mergeNext";
    day.periods[context.period] = emptyPeriod();
    if (courseId) removeCourseOccurrence(courseId, context.day, context.period);
    if (wasMerged && PERIODS[context.period + 1]) day.periods[context.period + 1] = emptyPeriod();
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

function removeCourseOccurrence(courseId, dayKey, periodIndex) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return;
  if (!Array.isArray(course.occurrences)) course.occurrences = courseOccurrences(course);
  course.occurrences = course.occurrences.filter((item) => !(item.day === dayKey && item.period === periodIndex));
  course.days = [...new Set(course.occurrences.map((item) => item.day))];
  course.periods = [...new Set(course.occurrences.map((item) => item.period))];
  if (!course.occurrences.length) {
    state.courses = state.courses.filter((item) => item.id !== courseId);
  }
}

function openActionTarget(actionTarget) {
  const { action, day, period, index } = actionTarget.dataset;
  if (action === "open-period") openEditor({ kind: "period", day, period: Number(period) });
  else if (action === "open-todo") openEditor({ kind: "todo", day, index: Number(index) });
  else if (action === "open-weekend") openEditor({ kind: "weekend", day, index: Number(index) });
}

function bindEvents() {
  document.querySelector("#shareBtn").addEventListener("click", async () => {
    const shareUrl = buildShareUrl();
    const shareData = { title: "七日课表", text: "打开链接后会自动恢复这份课表。", url: shareUrl };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("包含数据的分享链接已复制");
    } catch {
      showToast("请复制地址栏链接分享");
    }
  });

  document.querySelector("#coursesBtn").addEventListener("click", () => {
    document.querySelector("#coursesOverlay").hidden = false;
    renderCoursesPanel();
  });
  document.querySelector("#closeCourses").addEventListener("click", () => {
    document.querySelector("#coursesOverlay").hidden = true;
  });
  document.querySelector("#weekBtn").addEventListener("click", () => {
    document.querySelector("#weekOverlay").hidden = false;
    renderWeekPanel();
  });
  document.querySelector("#closeWeek").addEventListener("click", () => {
    document.querySelector("#weekOverlay").hidden = true;
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

  document.querySelector("#coursesBody").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "new-course") openCourseEditor(null);
    if (button.dataset.action === "edit-course") openCourseEditor(Number(button.dataset.index));
  });

  document.querySelector("#coursesBody").addEventListener("dblclick", (event) => {
    const row = event.target.closest('[data-action="edit-course"]');
    if (row) openCourseEditor(Number(row.dataset.index));
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
    if (actionTarget) openActionTarget(actionTarget);
  });

  document.querySelector("#weekGrid").addEventListener("keydown", (event) => {
    const card = event.target.closest('.slot-card[role="button"]');
    if (!card || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });

  let lastTap = { time: 0, key: "" };
  document.querySelector("#weekGrid").addEventListener(
    "touchend",
    (event) => {
      if (event.target.closest(".task-toggle") || event.target.closest(".head-add")) return;
      const actionTarget = event.target.closest("[data-action]");
      if (!actionTarget || !["open-period", "open-todo", "open-weekend"].includes(actionTarget.dataset.action)) return;
      const { action, day, period, index } = actionTarget.dataset;
      const key = `${action}:${day}:${period || index || ""}`;
      const now = Date.now();
      if (lastTap.key === key && now - lastTap.time < 380) {
        event.preventDefault();
        openActionTarget(actionTarget);
        lastTap = { time: 0, key: "" };
      } else {
        lastTap = { time: now, key };
      }
    },
    { passive: false }
  );

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
      document.querySelector("#editorContent").innerHTML = buildEditorForm(editorContext);
      return;
    }
    const endButton = event.target.closest('#endModeSwitch button[data-end-mode]');
    if (endButton) {
      const content = document.querySelector("#editorContent");
      const customField = content.querySelector("#customEndField");
      const buttons = content.querySelectorAll("#endModeSwitch button");
      buttons.forEach((button) => button.classList.toggle("active", button === endButton));
      if (customField) customField.hidden = endButton.dataset.endMode !== "custom";
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
  let zoomFrame = 0;
  document.querySelector("#zoomRange").addEventListener("input", (event) => {
    cancelAnimationFrame(zoomFrame);
    zoomFrame = requestAnimationFrame(() => setViewScale(Number(event.target.value)));
  });
  document.querySelector("#zoomRange").addEventListener("change", () => {
    setViewScale(state.settings.viewScale, { persist: true });
    showToast("缩放已调整");
  });
  document.querySelector("#unselectedCourses").addEventListener("change", (event) => {
    state.settings.showUnselectedCourses = event.target.checked;
    saveState();
    renderAll();
  });
  document.querySelector("#unselectedTodos").addEventListener("change", (event) => {
    state.settings.showUnselectedTodos = event.target.checked;
    saveState();
    renderAll();
  });

  const scroller = document.querySelector("#weekScroller");
  scroller.addEventListener(
    "scroll",
    () => {
      const dock = document.querySelector("#memoDock");
      dock.classList.toggle("visible", scroller.scrollTop > 24 || dock.classList.contains("expanded"));
    },
    { passive: true }
  );
  scroller.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length === 2) {
        pinchState = {
          startDistance: Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY),
          startScale: state.settings.viewScale
        };
      }
    },
    { passive: true }
  );
  scroller.addEventListener(
    "touchmove",
    (event) => {
      if (!pinchState || event.touches.length !== 2) return;
      event.preventDefault();
      const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
      if (pinchState.startDistance > 0) setViewScale(pinchState.startScale * (distance / pinchState.startDistance));
    },
    { passive: false }
  );
  const finishPinch = () => {
    if (!pinchState) return;
    pinchState = null;
    setViewScale(state.settings.viewScale, { persist: true });
  };
  scroller.addEventListener("touchend", finishPinch, { passive: true });
  scroller.addEventListener("touchcancel", finishPinch, { passive: true });

  document.querySelector("#memoDock").addEventListener("click", (event) => {
    if (event.target.closest(".memo-handle")) {
      const dock = document.querySelector("#memoDock");
      dock.classList.toggle("expanded");
      if (dock.classList.contains("expanded")) dock.classList.add("visible");
    }
  });
  document.querySelector("#memoInput").addEventListener("input", (event) => {
    state.settings.memo = event.target.value;
    saveState();
  });
}

function openCourseEditor(index) {
  courseEditorContext = index === null ? null : state.courses[index];
  courseDraftOccurrences = courseEditorContext
    ? courseOccurrences(courseEditorContext).map((item) => ({ ...item }))
    : [];
  const overlay = document.querySelector("#coursesOverlay");
  const body = document.querySelector("#coursesBody");
  const course = courseEditorContext || {};
  const weekStart = course.weeks?.start || "";
  const weekEnd = course.weeks?.end || "";
  body.innerHTML = `
    <div class="course-editor">
      <h3>${courseEditorContext ? "编辑课程" : "新增课程"}</h3>
      <div class="field"><label>课程名称</label><input id="ce-name" value="${escapeHtml(course.name || "")}" /></div>
      <div class="field-row">
        <div class="field"><label>教师</label><input id="ce-teacher" value="${escapeHtml(course.teacher || "")}" /></div>
        <label class="switch-row"><input type="checkbox" id="ce-showTeacher" ${course.showTeacher ? "checked" : ""} /><span>显示教师</span></label>
      </div>
      <div class="field"><label>地点</label><input id="ce-location" value="${escapeHtml(course.location || "")}" /></div>
      <div class="field-row">
        <div class="field"><label>起始周</label><input id="ce-weekStart" type="number" min="1" value="${escapeHtml(weekStart)}" /></div>
        <div class="field"><label>结束周</label><input id="ce-weekEnd" type="number" min="1" value="${escapeHtml(weekEnd)}" /></div>
      </div>
      <div class="field"><label>星期（可多选）</label><div class="chip-group" id="ce-days">${dayChips([])}</div></div>
      <div class="field"><label>时间（可多选）</label><div class="chip-group" id="ce-periods">${periodChips([])}</div></div>
      <button class="course-add-button occurrence-add" type="button" id="ceAddOccurrenceBtn">${icon("plus", 15)} 添加所选节次</button>
      <div class="field"><label>已排节次</label><div class="occurrence-list" id="ceOccurrences">${occurrenceRows(courseDraftOccurrences)}</div></div>
      ${colorPickerHtml(course.color || "blue")}
      <div class="sheet-actions">${courseEditorContext ? '<button class="sheet-button danger" type="button" id="deleteCourseBtn">删除</button>' : ""}<button class="sheet-button primary" type="button" id="saveCourseBtn">保存课程</button></div>
    </div>
  `;
  overlay.hidden = false;
  bindCourseEditorEvents(index);
}

function dayChips(selected) {
  return DAYS.filter((day) => day.type === "weekday")
    .map((day) => `<label class="chip ${selected.includes(day.key) ? "active" : ""}"><input type="checkbox" value="${day.key}" ${selected.includes(day.key) ? "checked" : ""} /><span>${day.label}</span></label>`)
    .join("");
}

function periodChips(selected) {
  return PERIODS.map((period, index) => `<label class="chip ${selected.includes(index) ? "active" : ""}"><input type="checkbox" value="${index}" ${selected.includes(index) ? "checked" : ""} /><span>${period.start}</span></label>`).join("");
}

function occurrenceRows(occurrences) {
  if (!occurrences.length) {
    return `<div class="occurrence-empty">暂无节次，请选择星期和时间后点击“添加所选节次”。</div>`;
  }
  return occurrences
    .map((item, index) => {
      const dayLabel = DAYS.find((day) => day.key === item.day)?.label || item.day;
      const meta = PERIODS[item.period];
      return `<div class="occurrence-chip"><span>${dayLabel} ${meta ? `${meta.start}-${meta.end}` : ""}</span><button type="button" data-action="remove-occurrence" data-index="${index}" aria-label="删除该节次">${icon("close", 13)}</button></div>`;
    })
    .join("");
}

function renderOccurrenceList() {
  const list = document.querySelector("#ceOccurrences");
  if (list) list.innerHTML = occurrenceRows(courseDraftOccurrences);
}

function bindCourseEditorEvents(index) {
  document.querySelector("#saveCourseBtn").addEventListener("click", () => saveCourse(index));
  const deleteBtn = document.querySelector("#deleteCourseBtn");
  if (deleteBtn) deleteBtn.addEventListener("click", () => deleteCourse(index));
  document.querySelector("#ceAddOccurrenceBtn").addEventListener("click", () => {
    const days = [...document.querySelectorAll("#ce-days input:checked")].map((input) => input.value);
    const periods = [...document.querySelectorAll("#ce-periods input:checked")].map((input) => Number(input.value));
    if (!days.length || !periods.length) {
      showToast("请选择星期和时间");
      return;
    }
    days.forEach((day) => {
      periods.forEach((period) => {
        if (!courseDraftOccurrences.some((item) => item.day === day && item.period === period)) {
          courseDraftOccurrences.push({ day, period });
        }
      });
    });
    renderOccurrenceList();
  });
  document.querySelector("#ceOccurrences").addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="remove-occurrence"]');
    if (!button) return;
    courseDraftOccurrences.splice(Number(button.dataset.index), 1);
    renderOccurrenceList();
  });
}

function saveCourse(index) {
  const name = document.querySelector("#ce-name").value.trim();
  if (!name) {
    showToast("请填写课程名称");
    return;
  }
  if (!courseDraftOccurrences.length) {
    showToast("请至少添加一个节次");
    return;
  }
  const weeks = parseWeekRange(document.querySelector("#ce-weekStart").value, document.querySelector("#ce-weekEnd").value);
  const color = document.querySelector('input[name="color"]:checked')?.value || "blue";
  const occurrences = courseDraftOccurrences.map((item) => ({ ...item }));
  const course = {
    id: index === null ? makeId() : state.courses[index].id,
    name,
    teacher: document.querySelector("#ce-teacher").value.trim(),
    showTeacher: document.querySelector("#ce-showTeacher").checked,
    location: document.querySelector("#ce-location").value.trim(),
    weeks,
    days: [...new Set(occurrences.map((item) => item.day))],
    periods: [...new Set(occurrences.map((item) => item.period))],
    occurrences,
    color
  };
  if (index === null) state.courses.push(course);
  else state.courses[index] = course;
  applyCourseToDays(course);
  saveState();
  courseEditorContext = null;
  courseDraftOccurrences = [];
  renderCoursesPanel();
  renderAll();
  showToast("课程已保存");
}

function deleteCourse(index) {
  const course = state.courses[index];
  if (!course) return;
  DAYS.filter((day) => day.type === "weekday").forEach((day) => {
    state.days[day.key].periods.forEach((period, periodIndex) => {
      if (period.data?.courseId === course.id) state.days[day.key].periods[periodIndex] = emptyPeriod();
    });
  });
  state.courses.splice(index, 1);
  saveState();
  courseEditorContext = null;
  courseDraftOccurrences = [];
  renderCoursesPanel();
  renderAll();
  showToast("课程已删除");
}

function buildShareUrl() {
  const json = JSON.stringify(state);
  const base64 = btoa(unescape(encodeURIComponent(json)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `${location.origin}${location.pathname}#share=${base64}`;
}

function applySharedDataIfPresent() {
  const match = location.hash.match(/^#share=(.+)$/);
  if (!match) return;
  try {
    const base64 = match[1].replaceAll("-", "+").replaceAll("_", "/");
    const json = decodeURIComponent(escape(atob(base64)));
    const incoming = JSON.parse(json);
    if (incoming && typeof incoming === "object" && incoming.days) {
      state = incoming;
      state.settings = { ...createDefaultState().settings, ...(state.settings || {}) };
      state.version = 3;
      state.courses = Array.isArray(state.courses) ? state.courses : [];
      if (!state.settings.firstWeekDate) state.settings.firstWeekDate = mondayISO(new Date());
      saveState();
      history.replaceState(null, "", location.pathname + location.search);
      showToast("已恢复分享的课表");
    }
  } catch {
    showToast("分享数据无法读取");
  }
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

applySharedDataIfPresent();
state.week = getCurrentWeekNumber();
bindEvents();
renderAll();
state.settings.viewScale = zoomBounds().defaultScale;
setViewScale(state.settings.viewScale, { persist: true });
registerServiceWorker();
