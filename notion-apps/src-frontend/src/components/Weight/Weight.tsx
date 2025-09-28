// src-frontend/Weight.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import 'chartjs-adapter-date-fns';
type WeightRow = {
  date: string;         // expected 'YYYY-MM-DD' (or any Date-parsable string)
  morning?: number;     // optional
  night?: number;       // optional
  title?: string;
};

type Props = {
  /** override if your API is hosted elsewhere */
  apiUrl?: string; // e.g. 'https://your-project.vercel.app/api/get-weights'
};

function parseDate(d: string): Date {
  // robust parse with fallback
  const dt = new Date(d);
  if (!isNaN(+dt)) return dt;
  // if input like `September 13, 2025`
  return new Date(Date.parse(d));
}

function fmtLabel(d: string) {
  const dt = parseDate(d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Weight({ apiUrl = "/api/get-weights" }: Props) {
  const [rows, setRows] = useState<WeightRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const morningCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const nightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const morningChartRef = useRef<Chart | null>(null);
  const nightChartRef = useRef<Chart | null>(null);

  // fetch once on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const url = `${apiUrl}?rows=1`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error("Bad payload: expected array");
        if (cancelled) return;
        setRows(data as WeightRow[]);
      } catch (e: any) {
        if (cancelled) return;
        setErr(e?.message ?? "failed to load weights");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiUrl]);

  // prep data
  const { labels, morningVals, nightVals } = useMemo(() => {
    const sorted = (rows ?? []).slice().sort((a, b) => {
      return +parseDate(a.date) - +parseDate(b.date);
    });

    const labels = sorted.map(r => fmtLabel(r.date));
    const morningVals = sorted.map(r => (typeof r.morning === "number" ? r.morning : null));
    const nightVals   = sorted.map(r => (typeof r.night   === "number" ? r.night   : null));
    return { labels, morningVals, nightVals };
  }, [rows]);

  // draw charts when data ready
  useEffect(() => {
    if (!rows || !morningCanvasRef.current || !nightCanvasRef.current) return;

    // destroy existing instances before creating new ones
    morningChartRef.current?.destroy();
    nightChartRef.current?.destroy();

    // Morning chart
    morningChartRef.current = new Chart(morningCanvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Morning",
            data: morningVals,
            spanGaps: true,
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Date" } },
          y: { title: { display: true, text: "Weight" }, beginAtZero: false },
        },
        plugins: {
          legend: { display: true },
          tooltip: { mode: "index", intersect: false },
        },
      },
    });

    // Night chart
    nightChartRef.current = new Chart(nightCanvasRef.current, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Night",
            data: nightVals,
            spanGaps: true,
            pointRadius: 3,
            borderWidth: 2,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Date" } },
          y: { title: { display: true, text: "Weight" }, beginAtZero: false },
        },
        plugins: {
          legend: { display: true },
          tooltip: { mode: "index", intersect: false },
        },
      },
    });

    // cleanup on unmount
    return () => {
      morningChartRef.current?.destroy();
      nightChartRef.current?.destroy();
    };
  }, [labels, morningVals, nightVals, rows]);

  return (
    <div className="w-full max-w-5xl mx-auto p-4 space-y-12">
      <header className="space-y-1">
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Weight Tracker</h1>
        <p style={{ opacity: 0.7 }}>Two charts: Morning & Night (x: date, y: weight)</p>
      </header>

      {err && (
        <div style={{ color: "#b91c1c", fontWeight: 600 }}>
          Failed to load: {err}
        </div>
      )}

      {!rows && !err && <div>Loading…</div>}

      {rows && (
        <>
          <section style={{ height: 320 }}>
            <h2 style={{ marginBottom: 8, fontWeight: 600 }}>Morning</h2>
            <canvas ref={morningCanvasRef} />
          </section>

          <section style={{ height: 320 }}>
            <h2 style={{ marginBottom: 8, fontWeight: 600 }}>Night</h2>
            <canvas ref={nightCanvasRef} />
          </section>
        </>
      )}
    </div>
  );
}