import { Link } from 'react-router-dom';
import { Card, DefinitionList, Hash } from '../../components/ui.jsx';

export default function ReceiptCard({ receipt }) {
  return (
    <Card title="Your verification receipt">
      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receipt code</p>
          <p className="mono mt-1 break-all text-xl font-semibold tracking-wider text-navy-900">{receipt.receiptCode}</p>
          <div className="mt-4">
            <DefinitionList items={[
              ['Election', receipt.electionTitle],
              ['Bulletin board position', receipt.bulletinSeq ?? 'Published in a shuffled batch (at the latest when voting closes)'],
              ['Ballot commitment', <Hash value={receipt.ballotCommitment} len={24} />],
            ]} />
          </div>
          <p className="mt-4 text-xs text-slate-500">
            This receipt contains no personal information, no time and does not reveal your choice. Keep the code private:
            anyone holding it can check that your ballot was recorded, nothing more.
          </p>
          <Link to={`/verify?code=${encodeURIComponent(receipt.receiptCode)}`} className="mt-4 inline-block text-sm font-semibold text-navy-700">Verify now →</Link>
        </div>
        {receipt.qrPngDataUri && (
          <div className="text-center">
            <img src={receipt.qrPngDataUri} alt="QR code linking to receipt verification" className="mx-auto h-48 w-48 rounded border border-slate-200" />
            <p className="mt-2 text-xs text-slate-500">Scan to verify</p>
          </div>
        )}
      </div>
    </Card>
  );
}
