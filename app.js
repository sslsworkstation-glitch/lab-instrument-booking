const API = window.BOOKING_API;

const $ = id => document.getElementById(id);
let config = null;
let bookings = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!API || API.includes("PASTE_")) {
    showGlobalError("Please configure the Apps Script Web App URL in index.html.");
    return;
  }

  $("weekDate").value = toDateInput(new Date());
  $("date").value = toDateInput(new Date());

  try {
    config = await getJson("?action=config");
    if (!config.ok) throw new Error(config.error);

    $("siteTitle").textContent = config.institution;
    populateInstruments();

    $("instrumentSelect").addEventListener("change", onInstrumentChange);
    $("weekDate").addEventListener("change", renderCalendar);
    $("refreshBtn").addEventListener("click", renderCalendar);
    $("bookingForm").addEventListener("submit", submitBooking);

    onInstrumentChange();
  } catch (e) {
    showGlobalError(e.message);
  }
}

function populateInstruments() {
  const select = $("instrumentSelect");
  select.innerHTML = "";
  config.instruments.forEach(i => {
    const o = document.createElement("option");
    o.value = i.id;
    o.textContent = i.name;
    select.appendChild(o);
  });
}

function onInstrumentChange() {
  const id = $("instrumentSelect").value;
  const instrument = config.instruments.find(i => i.id === id);
  if (!instrument) return;

  $("bookingInstrument").value = id;
  $("instrumentName").textContent = instrument.name;
  $("instrumentMeta").textContent =
    [instrument.location, instrument.description].filter(Boolean).join(" · ");

  const available = instrument.status.toLowerCase() === "available";
  $("statusBadge").textContent = instrument.status;
  $("statusBadge").classList.toggle("unavailable", !available);
  $("bookingForm").querySelector("button[type=submit]").disabled = !available;

  renderCalendar();
}

async function renderCalendar() {
  const id = $("instrumentSelect").value;
  if (!id) return;

  const base = parseDateInput($("weekDate").value);
  const monday = startOfWeek(base);
  const friday = addDays(monday, 5);

  $("calendar").innerHTML = "<p style='padding:16px'>Loading…</p>";

  try {
    const url = "?action=availability" +
      "&instrumentId=" + encodeURIComponent(id) +
      "&start=" + encodeURIComponent(monday.toISOString()) +
      "&end=" + encodeURIComponent(friday.toISOString());

    const data = await getJson(url);
    if (!data.ok) throw new Error(data.error);
    bookings = data.bookings || [];
    drawGrid(monday);
  } catch (e) {
    $("calendar").innerHTML = "<p style='padding:16px;color:#b42318'>" +
      escapeHtml(e.message) + "</p>";
  }
}

function drawGrid(monday) {
  const startHour = 8;
  const endHour = 18;
  const grid = document.createElement("div");
  grid.className = "cal-grid";

  addCell(grid, "Time", "cal-cell cal-header");

  for (let d=0; d<5; d++) {
    const date = addDays(monday, d);
    addCell(grid,
      date.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}),
      "cal-cell cal-header");
  }

  for (let hour=startHour; hour<endHour; hour++) {
    addCell(grid, formatHour(hour), "cal-cell time-cell");
    for (let d=0; d<5; d++) {
      const cellDate = addDays(monday,d);
      const cellStart = new Date(cellDate);
      cellStart.setHours(hour,0,0,0);
      const cellEnd = new Date(cellStart.getTime()+60*60000);

      const status = slotStatus(cellStart, cellEnd);
      const cell = document.createElement("div");
      cell.className = "cal-cell slot " + status;

      if (status === "available") {
        cell.title = "Click to select " + formatDateTime(cellStart);
        cell.addEventListener("click", () => selectSlot(cellStart, cellEnd, cell));
      } else {
        cell.textContent = status === "booked" ? "Booked" : "Maintenance";
      }
      grid.appendChild(cell);
    }
  }

  $("calendar").innerHTML = "";
  $("calendar").appendChild(grid);
}

function slotStatus(start, end) {
  for (const b of bookings) {
    const bs = new Date(b.start), be = new Date(b.end);
    if (bs < end && be > start) return b.status === "maintenance" ? "maintenance" : "booked";
  }
  return "available";
}

function selectSlot(start, end, cell) {
  document.querySelectorAll(".slot.selected").forEach(x => x.classList.remove("selected"));
  cell.classList.add("selected");

  $("date").value = toDateInput(start);
  $("startTime").value = toTimeInput(start);
  $("endTime").value = toTimeInput(end);
  $("bookingForm").scrollIntoView({behavior:"smooth", block:"start"});
}

async function submitBooking(ev) {
  ev.preventDefault();
  const button = ev.submitter;
  button.disabled = true;
  setMessage("", "");

  const date = $("date").value;
  const start = new Date(date + "T" + $("startTime").value + ":00");
  const end = new Date(date + "T" + $("endTime").value + ":00");

  const payload = {
    action:"book",
    instrumentId:$("bookingInstrument").value,
    name:$("name").value.trim(),
    email:$("email").value.trim(),
    purpose:$("purpose").value.trim(),
    start:start.toISOString(),
    end:end.toISOString()
  };

  try {
    const data = await postJson(payload);
    if (!data.ok) throw new Error(data.error);

    setMessage(
      "Booking confirmed. Your booking ID is " + data.bookingId +
      ". A confirmation email has been sent.",
      "success"
    );
    $("bookingForm").reset();
    $("date").value = date;
    $("startTime").value = toTimeInput(start);
    $("endTime").value = toTimeInput(end);
    renderCalendar();
  } catch (e) {
    setMessage(e.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function getJson(query) {
  const res = await fetch(API + query, {cache:"no-store"});
  return await res.json();
}

async function postJson(payload) {
  const res = await fetch(API, {
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(payload)
  });
  return await res.json();
}

function startOfWeek(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1-day;
  x.setDate(x.getDate()+diff);
  return x;
}
function addDays(d,n) { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function parseDateInput(s) { return new Date(s+"T00:00:00"); }
function toDateInput(d) {
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function toTimeInput(d) {
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
}
function formatHour(h) { return String(h).padStart(2,"0")+":00"; }
function formatDateTime(d) { return d.toLocaleString(); }
function addCell(parent,text,cls) {
  const c=document.createElement("div"); c.className=cls; c.textContent=text; parent.appendChild(c);
}
function setMessage(text,type) {
  $("formMessage").textContent=text;
  $("formMessage").className="message "+(type||"");
}
function showGlobalError(text) {
  document.querySelector("main").innerHTML =
    '<section class="card"><h2>Configuration required</h2><p class="message error">' +
    escapeHtml(text) + '</p></section>';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
