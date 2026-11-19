import { useMemo, useState } from 'react';
import { Alert, Badge, Card, Input, cx } from '../../components/ui.jsx';
import {
  BACKEND_GROUPS, COMMANDS, ENV_VARS, FLOWS, FRONTEND_GROUPS, LAYERS, OTHER_FILES, RUN_STEPS, SOFTWARE,
  TROUBLESHOOTING, URLS,
} from './guide/guideContent.js';

const SECTIONS = [
  ['install', '1. What to install'],
  ['run', '2. Run frontend + backend'],
  ['urls', '3. Useful addresses'],
  ['config', '4. Configuration (.env)'],
  ['architecture', '5. How the pieces fit'],
  ['flows', '6. Key flows'],
  ['frontend', '7. Frontend code map'],
  ['backend', '8. Backend code map'],
  ['other', '9. Scripts, docs, tooling'],
  ['commands', '10. Everyday commands'],
  ['troubleshooting', '11. Troubleshooting'],
];

const OS_OPTIONS = [['windows', 'Windows'], ['mac', 'macOS'], ['linux', 'Linux']];

function detectOs() {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Mac/i.test(ua)) return 'mac';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';
  return 'windows';
}

function CodeBlock({ code, lang }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="relative mt-2 overflow-hidden rounded-md bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-700 px-3 py-1 text-xs text-slate-400">
        <span>{lang}</span>
        <button type="button" onClick={copy} className="rounded px-2 py-0.5 text-slate-300 hover:bg-slate-700 hover:text-white">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words p-3 text-[13px] leading-relaxed text-slate-100"><code>{code}</code></pre>
    </div>
  );
}

function Section({ id, title, intro, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl font-semibold text-navy-900">{title}</h2>
      {intro && <p className="mt-1 text-sm text-slate-600">{intro}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function OsPicker({ os, onChange }) {
  return (
    <div role="radiogroup" aria-label="Operating system" className="inline-flex rounded-md border border-slate-300 bg-panel p-0.5">
      {OS_OPTIONS.map(([key, label]) => (
        <button key={key} type="button" role="radio" aria-checked={os === key} onClick={() => onChange(key)}
          className={cx('rounded px-3 py-1 text-sm font-medium',
            os === key ? 'bg-brand text-white' : 'text-slate-600 hover:text-navy-900')}>
          {label}
        </button>
      ))}
    </div>
  );
}

function matches(query, ...parts) {
  return parts.join(' ').toLowerCase().includes(query);
}

/** Keeps groups with a matching file (or a matching title, which keeps the whole group). */
function filterGroups(groups, query) {
  if (!query) return groups;
  return groups
    .map((g) => (matches(query, g.title, g.path, g.summary)
      ? g
      : { ...g, files: g.files.filter(([name, what]) => matches(query, g.path, name, what)) }))
    .filter((g) => g.files.length > 0);
}

function CodeMap({ groups, query }) {
  const shown = filterGroups(groups, query);
  if (shown.length === 0) return <p className="text-sm text-slate-500">No files match “{query}”.</p>;
  return shown.map((g) => (
    <Card key={g.title} title={g.title} padded={false}>
      <div className="border-b border-slate-100 px-5 py-3 text-sm">
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-navy-800">{g.path}</code>
        <p className="mt-1 text-slate-600">{g.summary}</p>
      </div>
      <dl className="divide-y divide-slate-100">
        {g.files.map(([name, what]) => (
          <div key={name} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
            <dt className="break-words font-mono text-xs font-medium text-navy-900">{name}</dt>
            <dd className="text-slate-700">{what}</dd>
          </div>
        ))}
      </dl>
    </Card>
  ));
}

export default function Guide() {
  const [os, setOs] = useState(detectOs);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const fileCount = useMemo(
    () => [...FRONTEND_GROUPS, ...BACKEND_GROUPS].reduce((n, g) => n + g.files.length, 0), []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header className="mb-8">
        <p className="text-sm font-medium text-navy-700">Developer guide</p>
        <h1 className="mt-1 text-3xl font-semibold text-navy-900">DigiVote project guide</h1>
        <p className="mt-2 max-w-3xl text-slate-600">
          Everything needed to install, run and understand DigiVote: the software to install, how to start the backend
          and frontend, and what every part of the code does, grouped by folder.
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Guide sections" className="mb-8 lg:mb-0">
          <ol className="space-y-1 text-sm lg:sticky lg:top-6">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded px-2 py-1 text-slate-600 hover:bg-panel-2 hover:text-navy-900">{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-12">
          <Section id="install" title="1. What to install"
            intro="Install the required tools, then open a new terminal and run each check command.">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-slate-600">Show commands for</span>
              <OsPicker os={os} onChange={setOs} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SOFTWARE.map((s) => (
                <Card key={s.name}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-navy-900">{s.name}</h3>
                    <Badge tone={s.required ? 'blue' : 'gray'}>{s.required ? 'Required' : 'Optional'}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{s.why}</p>
                  <CodeBlock lang={os === 'windows' ? 'powershell' : 'bash'} code={s[os]} />
                  {s.check && (
                    <p className="mt-2 text-sm text-slate-600">
                      Check: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.check}</code>
                      {s.expect && <> → {s.expect}</>}
                    </p>
                  )}
                </Card>
              ))}
            </div>
            <Alert kind="info" title="Windows: set JAVA_HOME">
              If <code>mvn -v</code> does not report Java 21, open <em>Edit the system environment variables</em> →
              Environment Variables, set <code>JAVA_HOME</code> to the JDK 21 folder
              (e.g. <code>C:\Program Files\Eclipse Adoptium\jdk-21…</code>), add <code>%JAVA_HOME%\bin</code> to Path,
              and open a new terminal.
            </Alert>
          </Section>

          <Section id="run" title="2. Run frontend + backend"
            intro="Do steps 1–2 once. Afterwards you only need steps 3 and 4, in two terminals, every time.">
            <OsPicker os={os} onChange={setOs} />
            <ol className="space-y-4">
              {RUN_STEPS.map((step, i) => {
                const variant = step.variants ? step.variants[os === 'windows' ? 'windows' : 'unix'] : step;
                return (
                  <li key={step.title}>
                    <Card>
                      <div className="flex items-start gap-3">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-navy-900">{step.title}</h3>
                          <p className="mt-1 text-sm text-slate-600">{step.body}</p>
                          {variant.note && <p className="mt-2 text-sm text-slate-700">{variant.note}</p>}
                          <CodeBlock lang={variant.lang} code={variant.code} />
                          {step.after && <p className="mt-2 text-sm text-emerald-800">✓ {step.after}</p>}
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ol>
            <Alert kind="warning" title="Stopping">
              Press <kbd>Ctrl+C</kbd> in each terminal. Keep the <code>.local/</code> folder: it holds the generated
              master key, without which elections that already opened voting cannot be tallied.
            </Alert>
          </Section>

          <Section id="urls" title="3. Useful addresses" intro="Available while the backend and frontend are running.">
            <Card padded={false}>
              <ul className="divide-y divide-slate-100">
                {URLS.map(([url, what]) => (
                  <li key={url} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <a href={url} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-navy-700 underline">{url}</a>
                    <span className="text-slate-600">{what}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>

          <Section id="config" title="4. Configuration (.env)"
            intro="The backend reads .env in the project root; the frontend reads frontend/.env.local. Both are git-ignored. Full lists: .env.example and frontend/.env.example.">
            <Card padded={false}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-5 py-2">Variable</th><th className="px-5 py-2">Needed</th><th className="px-5 py-2">Purpose</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ENV_VARS.map(([name, need, what]) => (
                      <tr key={name}>
                        <td className="px-5 py-2 font-mono text-xs text-navy-900">{name}</td>
                        <td className="whitespace-nowrap px-5 py-2 text-slate-600">{need}</td>
                        <td className="px-5 py-2 text-slate-700">{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          <Section id="architecture" title="5. How the pieces fit"
            intro="A request travels from the browser down to MySQL through these layers.">
            <ol className="space-y-2">
              {LAYERS.map(([name, what, tag], i) => (
                <li key={name} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-navy-700 text-xs font-semibold text-navy-900">{i + 1}</span>
                    {i < LAYERS.length - 1 && <span aria-hidden="true" className="w-0.5 flex-1 bg-accent-soft" />}
                  </div>
                  <div className="flex-1 rounded-lg border border-slate-200 bg-panel px-4 py-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy-900">{name}</span>
                      <Badge tone="gray">{tag}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{what}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Alert kind="info" title="One rule to remember">
              The frontend only hides what a role cannot use. The backend (AccessControlService) checks every request
              again, so changing a URL or browser state never grants access.
            </Alert>
          </Section>

          <Section id="flows" title="6. Key flows" intro="The three journeys that matter most, with the code that handles each step.">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {FLOWS.map((f) => (
                <Card key={f.title} title={f.title}>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                    {f.steps.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                </Card>
              ))}
            </div>
          </Section>

          <div className="space-y-3">
            <label htmlFor="guide-search" className="text-sm font-medium text-navy-900">
              Search the code map ({fileCount} entries)
            </label>
            <Input id="guide-search" type="search" placeholder="e.g. ballot, manifesto, AccessControl, wizard"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <Section id="frontend" title="7. Frontend code map"
            intro="React 19 + Vite + Tailwind CSS 4 + React Router + Axios + Chart.js, in frontend/src.">
            <CodeMap groups={FRONTEND_GROUPS} query={q} />
          </Section>

          <Section id="backend" title="8. Backend code map"
            intro="Java 21 + Spring Boot 3.5, package com.digivote in backend/src/main/java. Each package follows Controller → Service → Repository → Entity.">
            <CodeMap groups={BACKEND_GROUPS} query={q} />
          </Section>

          <Section id="other" title="9. Scripts, docs, tooling">
            <Card padded={false}>
              <dl className="divide-y divide-slate-100">
                {OTHER_FILES.map(([name, what]) => (
                  <div key={name} className="grid gap-1 px-5 py-2.5 text-sm sm:grid-cols-[minmax(0,16rem)_1fr] sm:gap-4">
                    <dt className="font-mono text-xs font-medium text-navy-900">{name}</dt>
                    <dd className="text-slate-700">{what}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </Section>

          <Section id="commands" title="10. Everyday commands" intro="Run from the project root.">
            <Card padded={false}>
              <ul className="divide-y divide-slate-100">
                {COMMANDS.map(([cmd, what]) => (
                  <li key={cmd} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <code className="break-all font-mono text-xs text-navy-900">{cmd}</code>
                    <span className="text-slate-600">{what}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>

          <Section id="troubleshooting" title="11. Troubleshooting">
            <div className="space-y-2">
              {TROUBLESHOOTING.map(([problem, fix]) => (
                <details key={problem} className="rounded-lg border border-slate-200 bg-panel px-4 py-3 shadow-sm">
                  <summary className="cursor-pointer text-sm font-medium text-navy-900">{problem}</summary>
                  <p className="mt-2 text-sm text-slate-700">{fix}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
