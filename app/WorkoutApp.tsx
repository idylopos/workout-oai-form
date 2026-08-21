"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createDemoData } from "./demo-plan";
import {
  clearPrivateData,
  loadPrivateData,
  requestPersistentStorage,
  savePrivateData,
} from "./private-storage";
import type {
  ExerciseResult,
  PrivateWorkoutData,
  WorkoutDay,
  WorkoutSession,
} from "./workout-types";
import { validatePrivateWorkoutData } from "./validate-import";

type Tab = "today" | "plan" | "history" | "data";
type StorageStatus = "checking" | "granted" | "best-effort" | "unavailable";

function dateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sessionFor(data: PrivateWorkoutData, dayId: string): WorkoutSession | undefined {
  return data.sessions.find((session) => session.date === dateKey() && session.dayId === dayId);
}

function resultFor(session: WorkoutSession | undefined, exerciseId: string): ExerciseResult {
  return (
    session?.results.find((result) => result.exerciseId === exerciseId) ?? {
      exerciseId,
      completed: false,
    }
  );
}

function chooseStartingDay(data: PrivateWorkoutData): WorkoutDay {
  const weekday = new Date().getDay();
  return data.plan.days.find((day) => day.weekday === weekday) ?? data.plan.days[0];
}

function downloadJson(data: PrivateWorkoutData) {
  const exportData = { ...data, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `workout-oai-backup-${dateKey()}.private.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function WorkoutApp() {
  const [data, setData] = useState<PrivateWorkoutData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("today");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [saved, persistence] = await Promise.all([
          loadPrivateData(),
          requestPersistentStorage(),
        ]);
        if (!active) return;
        setData(saved);
        setStorageStatus(persistence);
        if (saved) setSelectedDayId(chooseStartingDay(saved).id);
      } catch {
        if (active) {
          setStorageStatus("unavailable");
          setError("This browser could not open private storage. Import is disabled until storage is available.");
        }
      } finally {
        if (active) setLoaded(true);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !data) return;
    const timeout = window.setTimeout(() => {
      savePrivateData(data).catch(() => {
        setError("Your latest change could not be saved. Export a backup before closing this page.");
      });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [data, loaded]);

  const selectedDay = useMemo(() => {
    if (!data) return null;
    return data.plan.days.find((day) => day.id === selectedDayId) ?? chooseStartingDay(data);
  }, [data, selectedDayId]);

  const currentSession = data && selectedDay ? sessionFor(data, selectedDay.id) : undefined;
  const completedCount = selectedDay
    ? selectedDay.exercises.filter((exercise) => resultFor(currentSession, exercise.id).completed).length
    : 0;
  const completionPercent = selectedDay?.exercises.length
    ? Math.round((completedCount / selectedDay.exercises.length) * 100)
    : 0;

  function replaceSession(day: WorkoutDay, update: (session: WorkoutSession) => WorkoutSession) {
    setData((current) => {
      if (!current) return current;
      const existing = sessionFor(current, day.id) ?? {
        id: `${dateKey()}-${day.id}`,
        date: dateKey(),
        dayId: day.id,
        results: [],
      };
      const nextSession = update(existing);
      const sessions = current.sessions.filter((session) => session.id !== nextSession.id);
      return { ...current, sessions: [...sessions, nextSession] };
    });
  }

  function updateResult(day: WorkoutDay, exerciseId: string, patch: Partial<ExerciseResult>) {
    replaceSession(day, (session) => {
      const currentResult = resultFor(session, exerciseId);
      return {
        ...session,
        completedAt: undefined,
        results: [
          ...session.results.filter((result) => result.exerciseId !== exerciseId),
          { ...currentResult, ...patch },
        ],
      };
    });
  }

  async function importFile(file: File) {
    setError(null);
    setMessage(null);
    if (file.size > 2_000_000) {
      setError("That file is larger than 2 MB. Nothing was imported.");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const validated = validatePrivateWorkoutData(parsed);
      await savePrivateData(validated);
      setData(validated);
      setSelectedDayId(chooseStartingDay(validated).id);
      setTab("today");
      setMessage("Private plan imported on this device.");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "This file could not be imported.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function loadDemo() {
    const demo = createDemoData();
    setData(demo);
    setSelectedDayId(demo.plan.days[0].id);
    setMessage("Fictional demonstration data loaded. Replace it by importing your private plan.");
  }

  async function clearEverything() {
    await clearPrivateData();
    setData(null);
    setSelectedDayId(null);
    setShowClearConfirm(false);
    setTab("today");
    setMessage("Private data removed from this browser.");
  }

  if (!loaded) {
    return (
      <main className="loading-screen" aria-live="polite">
        <div className="loading-mark">W</div>
        <p>Opening your private training space…</p>
      </main>
    );
  }

  const navItems: Array<{ id: Tab; label: string; glyph: string }> = [
    { id: "today", label: "Today", glyph: "●" },
    { id: "plan", label: "Plan", glyph: "▦" },
    { id: "history", label: "History", glyph: "↗" },
    { id: "data", label: "Private data", glyph: "◇" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">W</span>
          <div><strong>Form</strong><small>Private training log</small></div>
        </div>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              className={tab === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              <span aria-hidden="true">{item.glyph}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="privacy-card">
          <span className="privacy-dot" />
          <div><strong>Device only</strong><small>No account. No analytics.</small></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
            <h1>{tab === "today" ? "Today’s training" : navItems.find((item) => item.id === tab)?.label}</h1>
          </div>
          <button className="backup-button" disabled={!data} onClick={() => data && downloadJson(data)} type="button">
            Export backup <span aria-hidden="true">↓</span>
          </button>
        </header>

        {(message || error) && (
          <div className={error ? "notice error" : "notice"} role={error ? "alert" : "status"}>
            <span>{error ? "!" : "✓"}</span>
            <p>{error ?? message}</p>
            <button aria-label="Dismiss message" onClick={() => { setError(null); setMessage(null); }} type="button">×</button>
          </div>
        )}

        {!data ? (
          <section className="onboarding-panel">
            <div className="onboarding-copy">
              <p className="eyebrow accent">Your plan stays yours</p>
              <h2>Bring your workout plan onto this device.</h2>
              <p>
                Import a private JSON backup to begin. It is validated and stored in this browser only—never uploaded to this website.
              </p>
              <div className="button-row">
                <button className="primary-button" onClick={() => fileInput.current?.click()} type="button">Import private plan</button>
                <button className="secondary-button" onClick={loadDemo} type="button">Explore fictional demo</button>
              </div>
              <input
                ref={fileInput}
                className="visually-hidden"
                type="file"
                accept="application/json,.json"
                onChange={(event) => event.target.files?.[0] && void importFile(event.target.files[0])}
              />
            </div>
            <div className="privacy-illustration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="lock-shape"><span>◆</span></div>
            </div>
            <div className="onboarding-footnotes">
              <div><strong>01</strong><span>Choose a private file</span></div>
              <div><strong>02</strong><span>Train and log offline</span></div>
              <div><strong>03</strong><span>Export regular backups</span></div>
            </div>
          </section>
        ) : tab === "today" && selectedDay ? (
          <section className="today-layout">
            <div className="workout-column">
              <div className="day-selector" aria-label="Choose training day">
                {data.plan.days.map((day) => (
                  <button
                    className={day.id === selectedDay.id ? "day-chip active" : "day-chip"}
                    key={day.id}
                    onClick={() => setSelectedDayId(day.id)}
                    type="button"
                  >
                    <span>{day.shortLabel}</span><small>{day.focus}</small>
                  </button>
                ))}
              </div>

              <article className="session-hero">
                <div>
                  <p className="eyebrow">Current session</p>
                  <h2>{selectedDay.label}</h2>
                  <p>{selectedDay.focus} · {selectedDay.durationMinutes ?? 45} min</p>
                </div>
                <div className="progress-ring" style={{ "--progress": `${completionPercent * 3.6}deg` } as React.CSSProperties}>
                  <span>{completionPercent}%</span>
                </div>
              </article>

              <div className="exercise-list">
                {selectedDay.exercises.map((exercise, index) => {
                  const result = resultFor(currentSession, exercise.id);
                  return (
                    <article className={result.completed ? "exercise-card complete" : "exercise-card"} key={exercise.id}>
                      <button
                        className="complete-toggle"
                        aria-label={`${result.completed ? "Mark incomplete" : "Mark complete"}: ${exercise.name}`}
                        aria-pressed={result.completed}
                        onClick={() => updateResult(selectedDay, exercise.id, { completed: !result.completed })}
                        type="button"
                      >{result.completed ? "✓" : index + 1}</button>
                      <div className="exercise-info">
                        <div className="exercise-heading"><h3>{exercise.name}</h3><span>{exercise.sets} sets × {exercise.reps}</span></div>
                        {exercise.cue && <p>{exercise.cue}</p>}
                        <div className="result-fields">
                          <label>Load<input value={result.load ?? ""} onChange={(event) => updateResult(selectedDay, exercise.id, { load: event.target.value })} placeholder="—" /></label>
                          <label>Reps<input value={result.reps ?? ""} onChange={(event) => updateResult(selectedDay, exercise.id, { reps: event.target.value })} placeholder={exercise.reps} /></label>
                          <label>RPE<input value={result.rpe ?? ""} onChange={(event) => updateResult(selectedDay, exercise.id, { rpe: event.target.value })} placeholder="1–10" /></label>
                          <label>Discomfort<input value={result.discomfort ?? ""} onChange={(event) => updateResult(selectedDay, exercise.id, { discomfort: event.target.value })} placeholder="0–10" /></label>
                        </div>
                        {exercise.substitution && <small className="substitution">Alternative: {exercise.substitution}</small>}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="session-notes">
                <label htmlFor="session-notes">Session notes</label>
                <textarea
                  id="session-notes"
                  value={currentSession?.notes ?? ""}
                  onChange={(event) => replaceSession(selectedDay, (session) => ({ ...session, notes: event.target.value }))}
                  placeholder="What felt strong? What should change next time?"
                  maxLength={2000}
                />
                <button
                  className="finish-button"
                  disabled={completedCount === 0}
                  onClick={() => {
                    replaceSession(selectedDay, (session) => ({ ...session, completedAt: new Date().toISOString() }));
                    setMessage("Session saved. Export a backup when you’re ready.");
                  }}
                  type="button"
                >Finish session <span>→</span></button>
              </div>
            </div>

            <aside className="session-aside">
              <div className="stat-card"><span className="stat-label">Progress</span><strong>{completedCount}<small> / {selectedDay.exercises.length}</small></strong><p>exercises complete</p></div>
              <div className="safety-card"><span className="safety-mark">+</span><h3>Train the plan, respect the signal.</h3><p>Stop any movement that causes sharp, escalating, or unfamiliar pain. Adjustments are data, not failure.</p></div>
              <div className="storage-card"><span className={`storage-indicator ${storageStatus}`} /><div><strong>{storageStatus === "granted" ? "Persistent storage" : "Best-effort storage"}</strong><small>{storageStatus === "granted" ? "Browser retention requested" : "Keep exported backups"}</small></div></div>
            </aside>
          </section>
        ) : tab === "plan" ? (
          <section className="panel-grid">
            {data.plan.days.map((day) => (
              <article className="plan-card" key={day.id}>
                <span className="plan-index">{day.shortLabel}</span>
                <p className="eyebrow">{day.focus}</p><h2>{day.label}</h2>
                <ul>{day.exercises.map((exercise) => <li key={exercise.id}><span>{exercise.name}</span><small>{exercise.sets} × {exercise.reps}</small></li>)}</ul>
                <button onClick={() => { setSelectedDayId(day.id); setTab("today"); }} type="button">Open session →</button>
              </article>
            ))}
          </section>
        ) : tab === "history" ? (
          <section className="history-panel">
            <div className="section-intro"><p className="eyebrow">Private record</p><h2>Your recent sessions</h2><p>Stored only in this browser and included in your exported backup.</p></div>
            {data.sessions.length === 0 ? <div className="empty-state"><span>○</span><h3>No sessions yet</h3><p>Complete an exercise and your first entry will appear here.</p></div> : (
              <div className="history-list">{[...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).map((session) => {
                const day = data.plan.days.find((item) => item.id === session.dayId);
                const complete = session.results.filter((result) => result.completed).length;
                return <article key={session.id}><time>{new Date(`${session.date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><div><h3>{day?.label ?? "Archived workout"}</h3><p>{complete} exercises completed{session.notes ? ` · ${session.notes}` : ""}</p></div><span>{session.completedAt ? "Finished" : "In progress"}</span></article>;
              })}</div>
            )}
          </section>
        ) : (
          <section className="data-layout">
            <article className="data-card primary-data-card"><p className="eyebrow">Privacy boundary</p><h2>Your information never needs to leave this device.</h2><p>The website contains the interface and validation rules. Your imported plan, session history, and notes stay in this browser.</p><div className="data-actions"><button className="primary-button" onClick={() => fileInput.current?.click()} type="button">Import replacement</button><button className="secondary-button" onClick={() => downloadJson(data)} type="button">Export backup</button></div><input ref={fileInput} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importFile(event.target.files[0])} /></article>
            <article className="data-card"><span className="data-icon">◇</span><h3>Storage status</h3><p>{storageStatus === "granted" ? "Persistent browser storage has been requested successfully." : "This browser may clear site data under storage pressure. Export backups regularly."}</p></article>
            <article className="data-card danger-card"><span className="data-icon">×</span><h3>Clear this device</h3><p>Remove the imported plan and every session stored by this site in this browser.</p>{showClearConfirm ? <div className="confirm-row"><button onClick={() => void clearEverything()} type="button">Confirm deletion</button><button onClick={() => setShowClearConfirm(false)} type="button">Cancel</button></div> : <button onClick={() => setShowClearConfirm(true)} type="button">Clear private data</button>}</article>
          </section>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button"><span>{item.glyph}</span>{item.label}</button>)}
      </nav>
    </div>
  );
}

