import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(BarElement, CategoryScale, LinearScale, ArcElement, LineElement, PointElement, Filler, Tooltip, Legend);

// Dark theme defaults shared by every chart.
ChartJS.defaults.color = '#9fb0dc';
ChartJS.defaults.borderColor = 'rgba(120, 140, 220, 0.16)';
ChartJS.defaults.font.family = 'Inter, ui-sans-serif, system-ui, sans-serif';

export const CHART_COLORS = {
  blue: '#3b82f6',
  cyan: '#22d3ee',
  purple: '#8b5cf6',
  green: '#22c55e',
  orange: '#f59e0b',
  red: '#ef4444',
  pink: '#ec4899',
  muted: '#475a97',
};

const WINNER = '#8b5cf6';
const BLUE = '#3b82f6';
const LIGHT = '#33437f';
const SKY = '#22d3ee';
const GRID = { color: 'rgba(120, 140, 220, 0.14)' };

export function ResultsChart({ items }) {
  const data = {
    labels: items.map((i) => i.label),
    datasets: [{
      label: 'Votes',
      data: items.map((i) => i.votes),
      backgroundColor: items.map((i) => (i.winner ? WINNER : BLUE)),
      borderRadius: 6,
    }],
  };
  return (
    <div className="h-64" role="img" aria-label="Votes per option">
      <Bar
        data={data}
        options={{
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { precision: 0 }, grid: GRID }, y: { grid: { display: false } } },
        }}
      />
    </div>
  );
}

export function TurnoutChart({ voted, eligible }) {
  const remaining = Math.max(eligible - voted, 0);
  return (
    <div className="mx-auto h-48 w-48" role="img" aria-label={`${voted} of ${eligible} eligible voters voted`}>
      <Doughnut
        data={{
          labels: ['Ballots accepted', 'Not yet voted'],
          datasets: [{ data: [voted, remaining], backgroundColor: [BLUE, LIGHT], borderWidth: 0 }],
        }}
        options={{ maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom' } } }}
      />
    </div>
  );
}

/** Eligible voters, credentials issued and accepted ballots side by side. */
export function ParticipationChart({ eligible, credentials, accepted }) {
  return (
    <div className="h-56" role="img" aria-label={`Eligible ${eligible}, credentials issued ${credentials}, ballots accepted ${accepted}`}>
      <Bar
        data={{
          labels: ['Eligible voters', 'Credentials issued', 'Ballots accepted'],
          datasets: [{ label: 'Count', data: [eligible, credentials, accepted], backgroundColor: [LIGHT, SKY, WINNER], borderRadius: 6 }],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: GRID }, x: { grid: { display: false } } },
        }}
      />
    </div>
  );
}

/** Turnout percentage of completed elections; every bar uses the same denominator (eligible voters). */
export function TurnoutComparisonChart({ rows }) {
  return (
    <div className="h-64" role="img" aria-label="Turnout percentage per completed election">
      <Bar
        data={{
          labels: rows.map((r) => r.label),
          datasets: [{ label: 'Turnout %', data: rows.map((r) => r.turnout), backgroundColor: BLUE, borderRadius: 6 }],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` }, grid: GRID }, x: { grid: { display: false } } },
        }}
      />
    </div>
  );
}

/** Trust checks by outcome. */
export function CheckStatusChart({ pass, warn, fail, notRun }) {
  const total = pass + warn + fail + notRun;
  if (!total) return null;
  return (
    <div className="mx-auto h-48 w-48" role="img" aria-label={`${pass} passed, ${warn} warnings, ${fail} failed, ${notRun} not run`}>
      <Doughnut
        data={{
          labels: ['Passed', 'Warnings', 'Failed', 'Not run'],
          datasets: [{ data: [pass, warn, fail, notRun], backgroundColor: ['#22c55e', '#f59e0b', '#ef4444', LIGHT], borderWidth: 0 }],
        }}
        options={{ maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }}
      />
    </div>
  );
}

/**
 * Ring with a total in the middle and a coloured legend beside it, as in the dashboard designs.
 * segments: [{ label, value, color }]. Pure SVG so the legend counts always match the ring.
 */
export function RingChart({ segments, centerValue, centerLabel, ariaLabel, size = 148 }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img"
        aria-label={ariaLabel ?? segments.map((s) => `${s.value} ${s.label}`).join(', ')}>
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#16224f" strokeWidth="16" />
          {total > 0 && segments.map((s) => {
            const len = (s.value / total) * c;
            const dash = Math.max(len - (segments.length > 1 ? 3 : 0), 0);
            const el = (
              <circle key={s.label} cx="70" cy="70" r={r} fill="none" stroke={s.color} strokeWidth="16"
                strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-3xl font-bold leading-none text-white">{centerValue}</span>
          {centerLabel && <span className="mt-1 text-xs text-slate-600">{centerLabel}</span>}
        </div>
      </div>
      <ul className="min-w-[8rem] space-y-2.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-slate-700">
            <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} aria-hidden="true" />
            <span className="font-semibold text-white">{s.value}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Smooth area line over named points (values are percentages 0-100 unless `max` says otherwise). */
export function AreaLineChart({ points, max = 100, unit = '%', label = 'Value', height = 'h-44' }) {
  return (
    <div className={height} role="img" aria-label={`${label}: ${points.map((p) => `${p.label} ${p.value}${unit}`).join(', ')}`}>
      <Line
        data={{
          labels: points.map((p) => p.label),
          datasets: [{
            label,
            data: points.map((p) => p.value),
            borderColor: '#3b82f6',
            borderWidth: 2.5,
            tension: 0.4,
            pointBackgroundColor: '#3b82f6',
            pointBorderColor: '#0a1230',
            pointRadius: 4,
            fill: true,
            backgroundColor: (ctx) => {
              const { chart } = ctx;
              if (!chart.chartArea) return 'rgba(59,130,246,0.15)';
              const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
              g.addColorStop(0, 'rgba(59,130,246,0.45)');
              g.addColorStop(1, 'rgba(59,130,246,0)');
              return g;
            },
          }],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y}${unit}` } } },
          scales: {
            y: { min: 0, max, ticks: { callback: (v) => `${v}${unit}`, maxTicksLimit: 6 }, grid: GRID },
            x: { grid: { display: false } },
          },
        }}
      />
    </div>
  );
}

/** Vertical bars, one colour per bar. rows: [{ label, value, color? }] */
export function ColorBarChart({ rows, height = 'h-40', ariaLabel = 'Bar chart' }) {
  const palette = [CHART_COLORS.blue, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.cyan, CHART_COLORS.orange];
  return (
    <div className={height} role="img" aria-label={`${ariaLabel}: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}>
      <Bar
        data={{
          labels: rows.map((r) => r.label),
          datasets: [{ data: rows.map((r) => r.value), backgroundColor: rows.map((r, i) => r.color ?? palette[i % palette.length]), borderRadius: 6, maxBarThickness: 44 }],
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 4 }, grid: GRID }, x: { grid: { display: false } } },
        }}
      />
    </div>
  );
}
