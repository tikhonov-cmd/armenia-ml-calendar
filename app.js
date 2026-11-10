(() => {
  "use strict";

  const { categories, audiences, statuses, phases, levels, channels, years, updated } = globalThis.armeniaAtlas;
  const byId = Object.fromEntries(channels.map(channel => [channel.id, channel]));
  const pinnedChannel = byId["ml-school"];
  const categoryOrder = Object.keys(categories);
  const $ = id => document.getElementById(id);
  const value = id => $(id).value;
  const numeric = new Intl.NumberFormat("ru-RU");
  const collator = new Intl.Collator("ru");
  const fullDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const shortDate = new Intl.DateTimeFormat("ru", { day: "numeric", month: "short", timeZone: "UTC" });
  const longMonth = new Intl.DateTimeFormat("ru", { month: "long", year: "numeric", timeZone: "UTC" });
  const utcDate = date => new Date(date + "T00:00:00Z");
  const yearOf = date => Number(date.slice(0, 4));
  const addDays = (date, days) => new Date(+utcDate(date) + days * 864e5).toISOString().slice(0, 10);
  const nextDay = date => addDays(date, 1);
  const position = (date, start, end) => (+utcDate(date) - +utcDate(start)) / (+utcDate(nextDay(end)) - +utcDate(start)) * 100;
  const later = (a, b) => a > b ? a : b;
  const earlier = (a, b) => a < b ? a : b;

  const todayParts = new Intl.DateTimeFormat("en", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Yerevan",
  }).formatToParts(new Date());
  const todayPart = type => todayParts.find(part => part.type === type).value;
  const today = [todayPart("year"), todayPart("month"), todayPart("day")].join("-");
  const initialYear = years.includes(yearOf(today)) ? yearOf(today) : years.at(-1);
  const state = { year: initialYear, view: "timeline", selected: new Set() };

  const html = input => String(input).replace(/[&<>"']/g, letter => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[letter]);
  const source = (url, title = "Источник") =>
    '<a class="source" href="' + html(url) + '" target="_blank" rel="noopener noreferrer">' + html(title) + ' <svg class="action-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg></a>';
  const plural = (number, forms) => {
    const last = number % 10;
    return number % 100 >= 11 && number % 100 <= 14 ? forms[2] : forms[last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
  };
  const counted = (number, forms) => number + " " + plural(number, forms);
  const channelCount = count => counted(count, ["канал", "канала", "каналов"]);
  const eventCount = count => counted(count, ["этап", "этапа", "этапов"]);

  function dates(start, end, withYear = true) {
    const format = withYear ? fullDate : shortDate;
    if (start === end) return format.format(utcDate(start));
    if (start.slice(0, 7) === end.slice(0, 7)) {
      return Number(start.slice(-2)) + "–" + format.format(utcDate(end));
    }
    return format.formatRange(utcDate(start), utcDate(end));
  }

  function eventDates(event, withYear = true) {
    if (event.status !== "approximate") return dates(event.start, event.end, withYear);
    return longMonth.formatRange(utcDate(event.start), utcDate(event.end));
  }

  const options = entries => entries.map(([key, name]) => '<option value="' + html(key) + '">' + html(name) + '</option>').join("");
  $("category").insertAdjacentHTML("beforeend", options(Object.entries(categories).map(([key, entry]) => [key, entry.name])));
  $("audience").insertAdjacentHTML("beforeend", options(Object.entries(audiences)));
  $("place").insertAdjacentHTML("beforeend", options([...new Set(channels.map(channel => channel.place))].sort(collator.compare).map(place => [place, place])));
  $("level").insertAdjacentHTML("beforeend", options(levels.map((level, i) => [i, i + " · " + level.name])));
  $("unit").insertAdjacentHTML("beforeend", options([...new Set(channels.flatMap(channel => channel.metrics.map(metric => metric.unit)))].sort(collator.compare).map(unit => [unit, unit])));
  $("level-legend").innerHTML = levels.map((level, index) =>
    '<li><span aria-hidden="true">' + index + '</span><div><strong>' + html(level.name) + '</strong><p>' + html(level.detail) + '</p></div></li>').join("");
  $("channel-total").textContent = channelCount(channels.length);
  $("event-total").textContent = eventCount(channels.reduce((sum, channel) => sum + channel.events.length, 0));

  const normalize = text => text.toLocaleLowerCase("ru").replaceAll("ё", "е");
  function filteredChannels() {
    const query = normalize(value("query").trim());
    const category = value("category");
    const audience = value("audience");
    const place = value("place");
    return channels.filter(channel => {
      const text = normalize([channel.title, channel.description, channel.place, categories[channel.category].name,
        ...channel.events.map(event => event.label)].join(" "));
      return (!category || category === channel.category) && (!audience || channel.audience.includes(audience)) &&
        (!place || channel.place === place) && (!query || query.split(/\s+/).every(token => text.includes(token)));
    });
  }

  function inScope(channel, start, end) {
    return channel.events.filter(event => event.end >= start && event.start <= end &&
      (!value("certainty") || value("certainty") === event.status));
  }

  function yearBounds() {
    return [state.year + "-01-01", state.year + "-12-31"];
  }

  function changeSection() {
    const directory = location.hash === "#directory";
    $("calendar").hidden = directory;
    $("directory").hidden = !directory;
    $("section-title").textContent = directory ? "Справочник" : "Календарь";
    $("section-lead").hidden = !directory;
    for (const tab of ["calendar", "directory"]) {
      if ((tab === "directory") === directory) $("nav-" + tab).setAttribute("aria-current", "page");
      else $("nav-" + tab).removeAttribute("aria-current");
    }
    render();
  }

  function render() {
    if ($("calendar").hidden) renderDirectory();
    else renderCalendar();
  }

  function markButton(channel, event, positioning = "") {
    const label = channel.title + ". " + event.label + ", " + eventDates(event) + ". " + statuses[event.status];
    const tooltip = event.label + " · " + eventDates(event, false);
    return '<button class="mark ' + event.status + (event.start === event.end ? ' point' : '') +
      '" type="button" data-channel="' + channel.id + '" data-event="' + channel.events.indexOf(event) +
      '" aria-label="' + html(label) + '" title="' + html(tooltip) + '" style="' + positioning + '"></button>';
  }

  function renderCalendar() {
    const [start, end] = yearBounds();
    const filtered = filteredChannels();
    const upcoming = state.view === "upcoming";
    $("year-controls").hidden = upcoming;
    $("legend").hidden = upcoming;
    $("compare").hidden = upcoming || !state.selected.size;
    for (const button of document.querySelectorAll("[data-year]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.year) === state.year));
    }
    for (const button of document.querySelectorAll("[data-view]")) {
      button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
    }
    if (upcoming) {
      renderUpcoming(filtered);
      return;
    }
    const calendarScroll = $("timeline")?.scrollLeft ?? 0;
    const pinned = { channel: pinnedChannel, events: inScope(pinnedChannel, start, end) };
    const entries = filtered.filter(channel => channel !== pinnedChannel)
      .map(channel => ({ channel, events: inScope(channel, start, end) })).filter(entry => entry.events.length);
    const eventTotal = entries.reduce((sum, entry) => sum + entry.events.length, pinned.events.length);
    $("calendar-count").textContent = channelCount(entries.length + 1) + " · " + eventCount(eventTotal);
    $("calendar-note").innerHTML = "ML School Armenia закреплена на шкале при любых фильтрах. Даты показаны за выбранный год. Подробнее о каналах в <a href=\"#directory\">справочнике</a>.";
    const noMatches = !entries.length && (!filtered.includes(pinnedChannel) || !pinned.events.length);
    $("calendar-content").innerHTML = timeline(pinned, entries, start, end) + (noMatches
      ? '<p class="empty">По этим фильтрам нет дат в ' + state.year + ' году. Измените фильтры или откройте справочник.</p>'
      : '');
    $("timeline").scrollLeft = calendarScroll;
    renderCompare(start, end, filtered);
  }

  function timeline(pinned, entries, start, end) {
    const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
    const percent = date => position(date, start, end);
    const monthStarts = monthNames.map((_, i) => state.year + "-" + String(i + 1).padStart(2, "0") + "-01");
    const monthPercents = [...monthStarts.map(percent), 100];
    const columnWidths = monthNames.map((_, i) => (monthPercents[i + 1] - monthPercents[i]) + "fr").join(" ");
    const showToday = today >= start && today <= end;
    const todayLine = showToday ? '<i class="today-line" aria-hidden="true" style="left:' + percent(today) + '%"></i>' : "";
    const grid = '<div class="months gridlines" aria-hidden="true">' + monthNames.map(() => "<i></i>").join("") + "</div>";
    const header = '<div class="timeline-head row"><div class="row-label"><span>Канал</span><span class="head-hint">Выбор для сравнения</span></div><div class="months">' +
      monthNames.map(name => "<span>" + name + "</span>").join("") + "</div></div>";
    function row({ channel, events }) {
      const selected = state.selected.has(channel.id);
      const laneEnds = [];
      const marks = [...events].sort((a, b) => a.start.localeCompare(b.start)).map(event => {
        let lane = laneEnds.findIndex(last => addDays(last, 6) < event.start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = event.end;
        const left = percent(later(event.start, start));
        const right = percent(nextDay(earlier(event.end, end)));
        return markButton(channel, event, "--left:" + (event.start === event.end ? (left + right) / 2 : left) +
          "%;--width:" + (right - left) + "%;--lane:" + lane);
      }).join("");
      const empty = events.length ? "" : '<span class="track-empty">Нет дат по выбранным условиям</span>';
      return '<div class="timeline-row row' + (selected ? " selected" : "") + '" style="--lanes:' + Math.max(1, laneEnds.length) + '">' +
        '<div class="row-label"><input type="checkbox" data-compare="' + channel.id + '" aria-label="Сравнить: ' + html(channel.title) + '"' +
        (selected ? ' checked' : '') + '><button class="channel-button" type="button" data-channel="' + channel.id +
        '">' + html(channel.title) + '</button></div><div class="track" data-track="' + channel.id + '">' + grid + todayLine + marks + empty + '</div></div>';
    }
    const pinnedRow = '<div class="timeline-pinned" style="--track-color:' + categories[pinned.channel.category].color + '">' + row(pinned) + '</div>';
    const groups = categoryOrder.filter(category => entries.some(entry => entry.channel.category === category)).map(category => {
      const group = categories[category];
      const rows = entries.filter(entry => entry.channel.category === category).map(row).join("");
      return '<div class="timeline-group" style="--track-color:' + group.color + '"><h3 class="group-label"><i></i>' + group.name + '</h3>' + rows + '</div>';
    }).join("");

    return '<div class="timeline-scroll" id="timeline" role="region" tabindex="0" aria-label="Годовая шкала ' + state.year +
      '"><div class="timeline" style="--months:' + columnWidths + '"><div class="timeline-top">' + header + pinnedRow + '</div>' + groups + '</div></div>';
  }

  function renderCompare(start, end, filtered) {
    const visible = new Set(filtered.map(channel => channel.id));
    visible.add(pinnedChannel.id);
    const selected = [...state.selected].map(id => byId[id]);
    const available = selected.filter(channel => visible.has(channel.id)).map(channel => ({
      channel, events: inScope(channel, start, end),
    })).filter(entry => entry.events.length);
    const titleList = selected.map(channel => '<span>' + html(channel.title) + '</span>').join("");
    const hiddenCount = selected.length - available.length;
    const intro = '<div class="compare-tags">' + titleList + '</div>' +
      (hiddenCount ? '<p class="small-note">В текущем году и фильтрах без видимых дат: ' + hiddenCount + '.</p>' : "");
    const overlaps = [];
    available.forEach((first, index) => {
      available.slice(index + 1).forEach(second => {
        first.events.forEach(a => second.events.forEach(b => {
          const from = later(later(a.start, b.start), start);
          const to = earlier(earlier(a.end, b.end), end);
          if (from <= to) overlaps.push({ first: first.channel, second: second.channel, a, b, from, to });
        }));
      });
    });
    overlaps.sort((a, b) => a.from.localeCompare(b.from));
    document.querySelectorAll(".overlap-band").forEach(band => band.remove());
    const bands = new Map();
    for (const { first, second, a, b, from, to } of overlaps) {
      const uncertain = a.status !== "exact" || b.status !== "exact";
      for (const channel of [first, second]) {
        const key = [channel.id, from, to, uncertain].join("/");
        bands.set(key, { id: channel.id, from, to, uncertain });
      }
    }
    for (const { id, from, to, uncertain } of bands.values()) {
      const band = document.createElement("i");
      band.className = uncertain ? "overlap-band uncertain" : "overlap-band";
      band.setAttribute("aria-hidden", "true");
      const left = position(from, start, end);
      const width = position(nextDay(to), start, end) - left;
      band.style.left = left + width / 2 + "%";
      band.style.setProperty("--span", width + "%");
      document.querySelector('[data-track="' + id + '"]')?.prepend(band);
    }
    $("overlap-legend").hidden = overlaps.length === 0;
    const count = counted(overlaps.length, ["совпадение", "совпадения", "совпадений"]);
    const selectedCount = channelCount(selected.length);
    $("compare-status").textContent = selectedCount + " · " + (available.length >= 2 ? count : "для сравнения нужны две строки");
    let result;
    if (available.length < 2) {
      result = '<p class="small-note">Для сравнения выберите ещё один канал с видимыми датами.</p>';
    } else if (!overlaps.length) {
      result = '<p class="small-note">В выбранном году этапы этих каналов по датам не пересекаются.</p>';
    } else {
      result = '<p class="small-note">' + count + ' по календарю. Учитывайте аудиторию и формат каждого этапа.</p><ul class="overlap-list">' +
        overlaps.map(({ first, second, a, b, from, to }) => {
          const uncertain = a.status !== "exact" || b.status !== "exact";
          const label = a.status === "approximate" || b.status === "approximate"
            ? longMonth.formatRange(utcDate(from), utcDate(to))
            : dates(from, to, false);
          return '<li><strong>' + html(label) + (uncertain ? ' <small>· уточнить</small>' : '') +
            '</strong><div>' + overlapButton(first, a) + overlapButton(second, b) + '</div></li>';
        }).join("") + '</ul>';
    }
    $("compare-content").innerHTML = intro + result;
  }

  function overlapButton(channel, event) {
    return '<button class="text-button" type="button" data-channel="' + channel.id + '" data-event="' +
      channel.events.indexOf(event) + '">' + html(channel.title + " · " + event.label) + '</button>';
  }

  function renderUpcoming(filtered) {
    const events = filtered.flatMap(channel => inScope(channel, today, years.at(-1) + "-12-31")
      .map(event => ({ channel, event })))
      .sort((a, b) => later(a.event.start, today).localeCompare(later(b.event.start, today)) || a.event.end.localeCompare(b.event.end));
    const channelTotal = new Set(events.map(entry => entry.channel.id)).size;
    $("calendar-count").textContent = channelCount(channelTotal) + " · " + eventCount(events.length);
    $("calendar-note").textContent = "Дата «сегодня» определяется по времени Еревана. Показаны будущие этапы и окна, которые ещё идут.";
    $("calendar-content").innerHTML = events.length
      ? '<ul class="upcoming">' + events.map(({ channel, event }) => '<li style="--track-color:' + categories[channel.category].color +
        '"><span class="upcoming-date">' + html(eventDates(event)) + '</span><div><button class="text-button" type="button" data-channel="' +
        channel.id + '" data-event="' + channel.events.indexOf(event) + '">' + html(event.label) +
        '</button><span class="upcoming-channel">' + html(channel.title) + '</span></div><span class="status ' + event.status +
        '">' + statuses[event.status] + '</span></li>').join("") + '</ul>'
      : '<p class="empty">По этим фильтрам ближайших дат пока нет. В годовой шкале можно посмотреть архивные этапы.</p>';
  }

  const categorySort = (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category) || collator.compare(a.title, b.title);
  const unitSize = (channel, unit) => Math.max(...channel.metrics.filter(metric => metric.unit === unit).map(metric => metric.value));
  function renderDirectory() {
    const unit = value("unit");
    const level = value("level");
    const sortSelect = $("sort");
    sortSelect.querySelector('[value="size"]').disabled = !unit;
    if (!unit && sortSelect.value === "size") sortSelect.value = "category";
    const sort = sortSelect.value;
    const list = filteredChannels().filter(channel => (!level || Number(level) === channel.level) &&
      (!unit || channel.metrics.some(metric => metric.unit === unit)));
    list.sort((a, b) => {
      if (sort === "level") return b.level - a.level || categorySort(a, b);
      if (sort === "size") return unitSize(b, unit) - unitSize(a, unit) || categorySort(a, b);
      if (sort === "title") return collator.compare(a.title, b.title);
      return categorySort(a, b);
    });
    $("directory-count").textContent = channelCount(list.length) + " из " + channels.length;
    $("directory-content").innerHTML = list.length ? list.map(card).join("") :
      '<p class="empty">Ни один канал не подходит под эти фильтры.</p>';
  }

  function metrics(channel) {
    if (!channel.metrics.length) return '<p class="metric-empty">Численность не найдена в проверенных источниках.</p>';
    return '<ul class="metrics">' + channel.metrics.map(metric => '<li><strong>' + html(metric.prefix) + numeric.format(metric.value) + ' ' + html(metric.unit) +
      '</strong><span>' + html(metric.label) + ' · ' + html(metric.year) + '</span>' + source(metric.url, "Источник числа") + '</li>').join("") + '</ul>';
  }

  function formal(channel) {
    return channel.formal ? '<div class="formal"><h4>Правила приёма</h4><p>' + html(channel.formal.text) + '</p>' +
      source(channel.formal.url, "Документ") + '</div>' : "";
  }

  function card(channel) {
    const category = categories[channel.category];
    return '<article class="channel-card" style="--track-color:' + category.color +
      '"><div class="card-meta"><span><i></i>' + category.name + '</span><span>' + html(channel.place) + '</span></div><h3>' +
      html(channel.title) + '</h3><p>' + html(channel.description) + '</p><div class="signal"><span class="signal-badge" aria-label="Уровень ' +
      channel.level + ' из 3">' + channel.level + '</span><div><strong>' + levels[channel.level].name + '</strong><p>' +
      html(channel.achievement) + '</p></div></div>' + metrics(channel) + formal(channel) + '<div class="card-footer">' +
      source(channel.url, "О канале") + '<button class="text-button" type="button" data-channel="' + channel.id + '">Этапы и аудитория</button></div></article>';
  }

  function openDetail(channel, event) {
    const category = categories[channel.category];
    const people = channel.audience.map(key => audiences[key]).join(" · ");
    const schedule = channel.events.length ? '<ul class="detail-schedule">' + channel.events.map(item => '<li' +
      (item === event ? ' class="current-event"' : '') + '><span><strong>' + html(item.label) + '</strong><small>' +
      html(eventDates(item)) + ' · ' + statuses[item.status] + '</small></span>' + source(item.url || channel.url, "Даты") + '</li>').join("") + '</ul>'
      : '<p>На шкале 2026–27 нет дат для этого канала.</p>';
    $("detail-content").innerHTML = '<div class="card-meta" style="--track-color:' + category.color + '"><span><i></i>' +
      category.name + '</span><span>' + html(channel.place) + '</span></div><h2 id="detail-title">' +
      html(event?.label ?? channel.title) + '</h2>' + (event ? '<p class="detail-subtitle">' + html(channel.title) + '</p>' : '') +
      (event ? '<p class="event-date">' + html(eventDates(event)) + '</p><p class="status ' + event.status + '">' + statuses[event.status] +
        ' · ' + phases[event.phase] + '</p><p>' + source(event.url || channel.url, "Источник даты") + '</p>' : '') +
      '<p class="detail-audience">' + html(people) + '</p><p>' + html(channel.description) + '</p><h3>Этапы канала</h3>' + schedule +
      '<div class="detail-footer">' + source(channel.url, "О канале") + '</div>';
    $("detail-dialog").showModal();
  }

  $("filters").addEventListener("submit", event => event.preventDefault());
  $("filters").addEventListener("input", render);
  for (const id of ["certainty", "level", "unit", "sort"]) $(id).addEventListener("change", render);
  $("reset").addEventListener("click", () => {
    for (const id of ["query", "category", "audience", "place", "certainty", "level", "unit"]) $(id).value = "";
    $("sort").value = "category";
    render();
  });
  function setCompareExpanded(expanded) {
    $("compare-content").hidden = !expanded;
    $("compare-toggle").setAttribute("aria-expanded", String(expanded));
    $("compare-toggle").textContent = expanded ? "Свернуть детали" : "Показать детали";
  }
  $("compare-toggle").addEventListener("click", () => setCompareExpanded($("compare-content").hidden));
  $("clear-compare").addEventListener("click", () => {
    state.selected.clear();
    setCompareExpanded(false);
    render();
    document.querySelector("[data-compare]")?.focus();
  });
  $("calendar-content").addEventListener("change", event => {
    const id = event.target.dataset.compare;
    if (!id) return;
    if (event.target.checked) state.selected.add(id);
    else state.selected.delete(id);
    if (!state.selected.size) setCompareExpanded(false);
    event.target.closest(".timeline-row").classList.toggle("selected", event.target.checked);
    $("compare").hidden = !state.selected.size;
    renderCompare(...yearBounds(), filteredChannels());
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const { year, view, channel, event: index } = button.dataset;
    if (year) {
      state.year = Number(year);
      render();
    } else if (view) {
      state.view = view;
      render();
    } else if (channel) {
      const record = byId[channel];
      openDetail(record, record.events[index]);
    }
  });
  $("detail-dialog").addEventListener("click", event => {
    if (event.target === $("detail-dialog")) $("detail-dialog").close();
  });
  // Keep the panel navigation at the workspace heading, including on keyboard activation.
  for (const tab of ["calendar", "directory"]) {
    $("nav-" + tab).addEventListener("click", event => {
      event.preventDefault();
      if (location.hash !== "#" + tab) history.pushState(null, "", "#" + tab);
      changeSection();
      if (tab === "directory") $("section-title").scrollIntoView({ block: "start" });
      else window.scrollTo(0, 0);
    });
  }
  window.addEventListener("hashchange", changeSection);
  changeSection();
})();
