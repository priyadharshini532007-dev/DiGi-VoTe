import { Badge, Card, DefinitionList, Hash, StatusBadge, Table } from '../../components/ui.jsx';
import { ResultsChart } from '../../components/Charts.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function ResultsPanel({ result }) {
  return (
    <div className="space-y-5">
      <Card title="Outcome" actions={<StatusBadge status={result.status} />}>
        <p className="text-lg font-semibold text-navy-900">{result.explanation}</p>
        <div className="mt-4">
          <DefinitionList items={[
            ['Counting method', result.countingMethod],
            ['Accepted ballots', result.acceptedBallots],
            ['Tie detected', result.tieDetected ? 'Yes' : 'No'],
            ['Generated', `${formatDateTime(result.generatedAt)} (run ${result.generationCount}×)`],
            ['Published', formatDateTime(result.publishedAt)],
            ['Result hash', <Hash value={result.resultHash} len={24} />],
            ['Bulletin board head at tally', <Hash value={result.bulletinHeadHash} len={24} />],
          ]} />
        </div>
      </Card>
      <Card title="Votes per option">
        <ResultsChart items={result.items} />
      </Card>
      <Card title="Ranking" padded={false}>
        <Table
          rowKey={(r) => r.optionIndex}
          rows={result.items}
          columns={[
            { key: 'rank', label: 'Rank' },
            { key: 'label', label: 'Option', render: (r) => <span className="font-medium">{r.label} {r.winner && <Badge tone="green">Winner</Badge>}</span> },
            { key: 'votes', label: 'Votes' },
            { key: 'percent', label: 'Share', render: (r) => `${r.percent}%` },
          ]}
        />
      </Card>
    </div>
  );
}
