import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import DataTable from '../components/DataTable.jsx';

const rows = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1, name: `Election ${String(i + 1).padStart(2, '0')}`, status: i % 2 ? 'VOTING' : 'DRAFT', votes: (i * 7) % 11,
}));

function setup(props = {}) {
  return render(
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      searchText={(r) => r.name}
      searchLabel="Search elections"
      filters={[{ key: 'status', label: 'Stage', options: [{ value: 'VOTING', label: 'Voting' }, { value: 'DRAFT', label: 'Draft' }], match: (r, v) => r.status === v }]}
      columns={[
        { key: 'name', label: 'Election', sortValue: (r) => r.name },
        { key: 'status', label: 'Stage' },
        { key: 'votes', label: 'Votes', sortValue: (r) => r.votes },
      ]}
      {...props}
    />,
  );
}

const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]).getAllByRole('row');

describe('DataTable', () => {
  it('paginates and moves between pages', async () => {
    setup();
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('Showing 1–10 of 25')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Showing 11–20 of 25')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  });

  it('searches and resets to the first page', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.type(screen.getByLabelText('Search elections'), 'election 07');
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText('Election 07')).toBeInTheDocument();
  });

  it('filters by a select and shows a message when nothing matches', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'VOTING');
    expect(screen.getByText('Showing 1–10 of 12')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search elections'), 'zzz');
    expect(screen.getByText('No records match the current search and filters.')).toBeInTheDocument();
  });

  it('sorts ascending then descending and exposes aria-sort', async () => {
    setup();
    const header = screen.getByRole('columnheader', { name: /Votes/ });
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    await userEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    const firstVotes = within(bodyRows()[0]).getAllByRole('cell')[2];
    expect(firstVotes).toHaveTextContent('10');
  });

  it('renders the empty, loading and error states', async () => {
    const { unmount } = setup({ rows: [], empty: 'No elections yet.' });
    expect(screen.getByText('No elections yet.')).toBeInTheDocument();
    unmount();
    const loading = setup({ loading: true });
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    loading.unmount();
    setup({ error: 'Network down' });
    expect(screen.getByText('Network down')).toBeInTheDocument();
  });
});
