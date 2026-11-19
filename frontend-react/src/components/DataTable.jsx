import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorState, Input, Select, SkeletonRows, cx } from './ui.jsx';
import { downloadCsv, fileStamp } from '../lib/download.js';

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Searchable, filterable, sortable, paginated table.
 *
 * columns: [{ key, label, render?, sortValue?, exportValue?, className? }]
 * filters: [{ key, label, options: [{ value, label }], match: (row, value) => boolean }]
 * `exportName` enables a CSV export of the currently filtered rows (columns with exportValue or a plain key).
 */
export default function DataTable({
  columns, rows, rowKey, searchText, searchLabel = 'Search', filters = [], pageSize = 10, empty = 'Nothing to show yet.',
  loading, error, onRetry, toolbar, initialSort, exportName, caption,
}) {
  const [query, setQuery] = useState('');
  const [values, setValues] = useState({});
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(0);

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = (rows ?? []).filter((r) => {
      if (q && searchText && !searchText(r).toLowerCase().includes(q)) return false;
      return filters.every((f) => !values[f.key] || f.match(r, values[f.key]));
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const get = col?.sortValue ?? ((r) => r[sort.key]);
      out = [...out].sort((a, b) => compare(get(a), get(b)) * (sort.dir === 'desc' ? -1 : 1));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, values, sort, columns]);

  const pages = Math.max(1, Math.ceil(processed.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [page, pages]);
  const visible = processed.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (col) => {
    if (!(col.sortValue || col.sortable)) return;
    setSort((s) => (s?.key === col.key ? (s.dir === 'asc' ? { key: col.key, dir: 'desc' } : null) : { key: col.key, dir: 'asc' }));
    setPage(0);
  };

  const exportRows = () => {
    const cols = columns
      .filter((c) => c.exportValue || (!c.render && c.label))
      .map((c) => ({ label: c.label, value: c.exportValue ?? ((r) => r[c.key]) }));
    downloadCsv(`${exportName}-${fileStamp()}.csv`, cols, processed);
  };

  const hasToolbar = searchText || filters.length > 0 || toolbar || exportName;

  return (
    <div>
      {hasToolbar && (
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-3">
          {searchText && (
            <div className="min-w-[12rem] flex-1">
              <label htmlFor={`dt-search-${searchLabel}`} className="sr-only">{searchLabel}</label>
              <Input id={`dt-search-${searchLabel}`} type="search" placeholder={`${searchLabel}…`} value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
            </div>
          )}
          {filters.map((f) => (
            <div key={f.key}>
              <label htmlFor={`dt-filter-${f.key}`} className="sr-only">{f.label}</label>
              <Select id={`dt-filter-${f.key}`} value={values[f.key] ?? ''} className="w-44"
                onChange={(e) => { setValues({ ...values, [f.key]: e.target.value }); setPage(0); }}>
                <option value="">{f.label}: all</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </div>
          ))}
          {toolbar}
          {exportName && (
            <Button variant="secondary" size="sm" onClick={exportRows} disabled={!processed.length}>Export CSV</Button>
          )}
        </div>
      )}

      {loading && <SkeletonRows />}
      {error && <div className="p-5"><ErrorState message={error} onRetry={onRetry} /></div>}
      {!loading && !error && (
        processed.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            {(rows ?? []).length > 0 ? 'No records match the current search and filters.' : empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              {caption && <caption className="sr-only">{caption}</caption>}
              <thead>
                <tr>
                  {columns.map((c) => {
                    const sortable = Boolean(c.sortValue || c.sortable);
                    const dir = sort?.key === c.key ? sort.dir : null;
                    return (
                      <th key={c.key} scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined}
                        className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">
                        {sortable ? (
                          <button type="button" onClick={() => toggleSort(c)} className="inline-flex items-center gap-1 hover:text-navy-800">
                            {c.label}
                            <span aria-hidden="true">{dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '↕'}</span>
                          </button>
                        ) : c.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-panel">
                {visible.map((row, i) => (
                  <tr key={rowKey ? rowKey(row) : i} className="hover:bg-panel-2">
                    {columns.map((c) => (
                      <td key={c.key} className={cx('px-4 py-2.5 align-top', c.className)}>
                        {c.render ? c.render(row) : row[c.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && !error && processed.length > pageSize && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, processed.length)} of {processed.length}
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <span>Page {page + 1} of {pages}</span>
            <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </span>
        </nav>
      )}
    </div>
  );
}
