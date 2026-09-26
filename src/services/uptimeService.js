const mongoose = require("mongoose");
const ChargerUptimeDay = require("../models/chargerUptimeDaySchema");
const EvMachine = require("../models/evMachineSchema");

// Charger uptime from the OCPP server's "ocpplogs" collection (same database, written by
// the OCPP server, expires after 30 days).
//
// - Online: every message a charger sends (heartbeat every 30s, meter values, status...)
//   proves it is connected. A gap longer than OFFLINE_AFTER between two messages is an
//   offline period, counted from the last message to the next ("last seen -> back").
//   "Unavailable" entries are written by the OCPP server itself on heartbeat timeout, so
//   they are not evidence of the charger being connected and are ignored.
// - Fault: time while online during which any connector (0 = whole charger) reported
//   Faulted or Unavailable in a StatusNotification.
//
// Completed Nepal days are stored permanently in ChargerUptimeDay; today (and any day that
// has not finished yet) is always calculated live.

const DAY_MS = 24 * 60 * 60 * 1000;
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const OFFLINE_AFTER_MS = (Number(process.env.UPTIME_OFFLINE_AFTER_SECONDS) || 120) * 1000;
// A day is stored only this long after it ends, so late-arriving log writes are included
const SETTLE_MS = 10 * 60 * 1000;
// How far back to look for a connector's status at the start of a window
const STATUS_LOOKBACK_MS = 2 * DAY_MS;
const FAULT_STATUSES = new Set(["Faulted", "Unavailable"]);
const MAX_INCIDENTS_PER_DAY = 200;
const JOB_DAYS = 29;

const ocppLogs = () => mongoose.connection.db.collection("ocpplogs");

//! ---------- time helpers (Nepal days, no DST)

const dayStart = (day) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - NEPAL_OFFSET_MS;
};
const nepalDay = (ms) => new Date(ms + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
const isCompleteDay = (day, now) => dayStart(day) + DAY_MS + SETTLE_MS <= now;

function daysBetween(fromMs, toMs) {
  const days = [];
  for (let ms = fromMs; ms < toMs; ms += DAY_MS) days.push(nepalDay(ms));
  return days;
}

//! ---------- interval helpers ([start, end] pairs in ms)

function mergeIntervals(list) {
  const sorted = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

const totalMs = (list) => list.reduce((sum, [s, e]) => sum + (e - s), 0);

function intersectIntervals(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i][0], b[j][0]);
    const e = Math.min(a[i][1], b[j][1]);
    if (e > s) out.push([s, e]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return out;
}

function complement(intervals, start, end) {
  const out = [];
  let cursor = start;
  for (const [s, e] of intervals) {
    if (s > cursor) out.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

//! ---------- raw data

// Oldest raw log still kept; days before it can only come from stored daily rows
async function logsStartMs() {
  const [first] = await ocppLogs().find({}, { projection: { createdAt: 1 } }).sort({ createdAt: 1 }).limit(1).toArray();
  return first ? first.createdAt.getTime() : null;
}

// Contacts are reduced in the database: per charger only the first/last contact and the
// gaps longer than OFFLINE_AFTER come back (a day of 30s heartbeats is ~2,900 rows each).
async function loadEvents(cpids, fromMs, toMs) {
  const [contactSummary, statuses] = await Promise.all([
    ocppLogs()
      .aggregate(
        [
          {
            $match: {
              CPID: { $in: cpids },
              source: "CP",
              messageType: { $ne: "Unavailable" },
              createdAt: { $gte: new Date(fromMs - OFFLINE_AFTER_MS), $lt: new Date(toMs) },
            },
          },
          { $project: { _id: 0, CPID: 1, t: "$createdAt" } },
          {
            $setWindowFields: {
              partitionBy: "$CPID",
              sortBy: { t: 1 },
              output: { prev: { $shift: { output: "$t", by: -1 } } },
            },
          },
          {
            $facet: {
              gaps: [
                { $match: { prev: { $ne: null }, $expr: { $gt: [{ $subtract: ["$t", "$prev"] }, OFFLINE_AFTER_MS] } } },
                { $project: { CPID: 1, prev: 1, t: 1 } },
              ],
              bounds: [{ $group: { _id: "$CPID", first: { $min: "$t" }, last: { $max: "$t" } } }],
            },
          },
        ],
        { allowDiskUse: true }
      )
      .toArray(),
    ocppLogs()
      .find(
        {
          CPID: { $in: cpids },
          messageType: "StatusNotification",
          createdAt: { $gte: new Date(fromMs - STATUS_LOOKBACK_MS), $lt: new Date(toMs) },
        },
        { projection: { CPID: 1, createdAt: 1, "payload.connectorId": 1, "payload.status": 1, "payload.errorCode": 1 } }
      )
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  const byCpid = new Map(cpids.map((cpid) => [cpid, { first: null, last: null, gaps: [], statuses: [] }]));
  const [{ gaps = [], bounds = [] } = {}] = contactSummary;
  for (const b of bounds) Object.assign(byCpid.get(b._id) || {}, { first: b.first.getTime(), last: b.last.getTime() });
  for (const g of gaps) byCpid.get(g.CPID)?.gaps.push([g.prev.getTime(), g.t.getTime()]);
  for (const s of statuses) byCpid.get(s.CPID)?.statuses.push(s);
  return byCpid;
}

//! ---------- calculation

// first/last: earliest and latest contact from (start - OFFLINE_AFTER) to end;
// gaps: [previous contact, next contact] pairs further apart than OFFLINE_AFTER.
// Offline runs from the last contact to the next one ("last seen -> back").
function offlineIntervals({ first, last, gaps }, start, end) {
  if (first === null) return { off: [[start, end]], lastContact: null };
  const off = [];
  // no contact in the lead-in: offline from the window start until the first contact
  if (first > start) off.push([start, first]);
  for (const [prev, next] of gaps) {
    if (next > start) off.push([Math.max(prev, start), next]);
  }
  if (end - last > OFFLINE_AFTER_MS) off.push([Math.max(last, start), end]);
  return { off: mergeIntervals(off), lastContact: last };
}

function faultIntervals(statuses, start, end) {
  const byConnector = new Map();
  for (const s of statuses) {
    const connectorId = Number(s.payload?.connectorId ?? 0);
    if (!byConnector.has(connectorId)) byConnector.set(connectorId, []);
    byConnector.get(connectorId).push(s);
  }

  const incidents = [];
  const all = [];
  for (const [connectorId, events] of byConnector) {
    let faultSince = null;
    let faultInfo = null;
    const close = (at) => {
      const s = Math.max(faultSince, start);
      const e = Math.min(at, end);
      if (e > s) {
        all.push([s, e]);
        incidents.push({ type: "fault", connectorId, ...faultInfo, start: s, end: e });
      }
      faultSince = null;
    };
    for (const ev of events) {
      const t = ev.createdAt.getTime();
      const isFault = FAULT_STATUSES.has(ev.payload?.status);
      if (isFault && faultSince === null) {
        faultSince = t;
        faultInfo = { status: ev.payload.status, errorCode: ev.payload.errorCode || "" };
      } else if (!isFault && faultSince !== null) {
        close(t);
      }
    }
    if (faultSince !== null) close(end);
  }
  return { faults: mergeIntervals(all), incidents };
}

// Uptime of each charger for [fromMs, toMs); null for a charger when no raw logs cover it
async function computeWindow(cpids, fromMs, toMs, logsStart) {
  const result = new Map();
  if (!cpids.length) return result;
  const start = Math.max(fromMs, logsStart ?? toMs);
  if (start >= toMs) {
    for (const cpid of cpids) result.set(cpid, null);
    return result;
  }

  const events = await loadEvents(cpids, start, toMs);
  for (const cpid of cpids) {
    const { statuses, ...contacts } = events.get(cpid);
    const { off, lastContact } = offlineIntervals(contacts, start, toMs);
    const online = complement(off, start, toMs);
    const { faults, incidents: faultIncidents } = faultIntervals(statuses, start, toMs);
    const faultOnline = intersectIntervals(faults, online);

    const incidents = [
      ...off.map(([s, e]) => ({ type: "offline", start: s, end: e })),
      ...faultIncidents,
    ]
      .sort((a, b) => a.start - b.start)
      .map((inc) => ({
        ...inc,
        start: new Date(inc.start),
        end: new Date(inc.end),
        durationSeconds: Math.round((inc.end - inc.start) / 1000),
      }));

    const covered = toMs - start;
    const offlineMs = totalMs(off);
    result.set(cpid, {
      coveredSeconds: Math.round(covered / 1000),
      onlineSeconds: Math.round((covered - offlineMs) / 1000),
      offlineSeconds: Math.round(offlineMs / 1000),
      faultSeconds: Math.round(totalMs(faultOnline) / 1000),
      offlineIncidents: off.length,
      faultIncidents: faultIncidents.length,
      incidents,
      lastContact: lastContact ? new Date(lastContact) : null,
    });
  }
  return result;
}

//! ---------- permanent daily rows

// Stores any missing completed days for these chargers that raw logs still cover.
// Idempotent: existing rows are never changed; concurrent writers are harmless.
async function ensureDays(chargers, days, now = Date.now()) {
  if (!chargers.length || !days.length) return;
  const cpids = chargers.map((c) => c.CPID);
  const existing = await ChargerUptimeDay.find({ cpid: { $in: cpids }, day: { $in: days } }, "cpid day").lean();
  const have = new Set(existing.map((row) => `${row.cpid}|${row.day}`));
  const logsStart = await logsStartMs();
  if (logsStart === null) return;

  for (const day of days) {
    const from = dayStart(day);
    const to = from + DAY_MS;
    if (!isCompleteDay(day, now) || to <= logsStart) continue;
    const missing = chargers.filter((c) => !have.has(`${c.CPID}|${day}`));
    if (!missing.length) continue;

    const computed = await computeWindow(missing.map((c) => c.CPID), from, to, logsStart);
    const ops = [];
    for (const charger of missing) {
      const r = computed.get(charger.CPID);
      if (!r) continue;
      const { lastContact, incidents, ...totals } = r;
      ops.push({
        updateOne: {
          filter: { cpid: charger.CPID, day },
          update: {
            $setOnInsert: {
              cpid: charger.CPID,
              chargerId: charger._id,
              stationId: charger.location_name,
              day,
              ...totals,
              incidents: incidents.slice(0, MAX_INCIDENTS_PER_DAY),
              computedAt: new Date(now),
            },
          },
          upsert: true,
        },
      });
    }
    if (ops.length) {
      try {
        await ChargerUptimeDay.bulkWrite(ops, { ordered: false });
      } catch (error) {
        // another request/job stored the same day first
        if (error.code !== 11000 && !error.writeErrors?.every((e) => e.code === 11000)) throw error;
      }
    }
  }
}

//! ---------- report for one station

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : null);

function summarize(t) {
  return {
    ...t,
    uptimePct: pct(t.onlineSeconds, t.coveredSeconds),
    availabilityPct: pct(t.onlineSeconds - t.faultSeconds, t.coveredSeconds),
  };
}

const emptyTotals = () => ({
  coveredSeconds: 0,
  onlineSeconds: 0,
  offlineSeconds: 0,
  faultSeconds: 0,
  offlineIncidents: 0,
  faultIncidents: 0,
});

function addTotals(target, row) {
  for (const key of Object.keys(emptyTotals())) target[key] += row[key] || 0;
}

// chargers: [{ _id, CPID, name, location_name, cpidStatus }]; range from resolveDateRange
async function getStationUptime(chargers, { fromDate, toDate }, { incidentLimit = 200, perChargerDay = false } = {}) {
  const now = Date.now();
  const cpids = chargers.map((c) => c.CPID);
  const days = daysBetween(fromDate.getTime(), toDate.getTime());
  const completeDays = days.filter((d) => isCompleteDay(d, now));
  const liveDays = days.filter((d) => !isCompleteDay(d, now) && dayStart(d) < now);

  await ensureDays(chargers, completeDays, now);
  const stored = await ChargerUptimeDay.find({ cpid: { $in: cpids }, day: { $in: completeDays } }).lean();

  // Unfinished days (today) are calculated live and never stored
  const logsStart = await logsStartMs();
  const live = [];
  for (const day of liveDays) {
    const from = dayStart(day);
    const computed = await computeWindow(cpids, from, Math.min(from + DAY_MS, now), logsStart);
    for (const cpid of cpids) {
      const r = computed.get(cpid);
      if (r) live.push({ cpid, day, ...r, live: true });
    }
  }
  const rows = [...stored, ...live];

  const byCharger = new Map(chargers.map((c) => [c.CPID, emptyTotals()]));
  const byDay = new Map(days.map((d) => [d, emptyTotals()]));
  const incidents = [];
  const lastContact = new Map();
  for (const row of rows) {
    addTotals(byCharger.get(row.cpid), row);
    addTotals(byDay.get(row.day), row);
    for (const inc of row.incidents || []) {
      incidents.push({ ...inc, cpid: row.cpid, ongoing: !!row.live && inc.type === "offline" && inc.end.getTime() >= now - 1000 });
    }
    if (row.live && row.lastContact) lastContact.set(row.cpid, row.lastContact);
  }

  const totals = emptyTotals();
  for (const t of byCharger.values()) addTotals(totals, t);
  incidents.sort((a, b) => b.start - a.start);

  return {
    offlineAfterSeconds: OFFLINE_AFTER_MS / 1000,
    detailAvailableFrom: logsStart ? new Date(logsStart) : null,
    totals: summarize(totals),
    chargers: chargers.map((c) => ({
      cpid: c.CPID,
      name: c.name || "",
      status: c.cpidStatus || "",
      lastContact: lastContact.get(c.CPID) || null,
      ...summarize(byCharger.get(c.CPID)),
    })),
    daily: days.map((day) => {
      const t = byDay.get(day);
      return { date: day, live: liveDays.includes(day), hasData: t.coveredSeconds > 0, ...summarize(t) };
    }),
    incidents: incidents.slice(0, incidentLimit),
    incidentsTotal: incidents.length,
    // one row per charger per day with data (exports)
    ...(perChargerDay && {
      chargerDays: rows
        .map((row) => ({ date: row.day, cpid: row.cpid, live: !!row.live, ...summarize(row) }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.cpid.localeCompare(b.cpid)),
    }),
  };
}

//! ---------- scheduled job

let jobRunning = false;

// Stores the last JOB_DAYS completed days for every charger (only missing ones)
async function snapshotRecentDays() {
  if (jobRunning || mongoose.connection.readyState !== 1) return;
  jobRunning = true;
  try {
    const now = Date.now();
    const chargers = await EvMachine.find({}, "CPID location_name").lean();
    const today = nepalDay(now);
    const days = [];
    for (let i = JOB_DAYS; i >= 1; i--) days.push(nepalDay(dayStart(today) - i * DAY_MS));
    await ensureDays(chargers, days, now);
  } catch (error) {
    console.error("Uptime snapshot job failed:", error.message);
  } finally {
    jobRunning = false;
  }
}

function startUptimeSnapshotJob() {
  if (process.env.UPTIME_SNAPSHOT_JOB === "off") return;
  setTimeout(snapshotRecentDays, 60 * 1000).unref();
  setInterval(snapshotRecentDays, 60 * 60 * 1000).unref();
}

module.exports = {
  getStationUptime,
  ensureDays,
  computeWindow,
  snapshotRecentDays,
  startUptimeSnapshotJob,
  // exported for tests
  _internal: { dayStart, nepalDay, OFFLINE_AFTER_MS },
};
