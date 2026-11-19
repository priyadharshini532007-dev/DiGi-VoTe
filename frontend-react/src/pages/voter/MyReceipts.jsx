import { getReceipts } from '../../lib/credentialStore.js';
import { EmptyState, PageHeader } from '../../components/ui.jsx';
import ReceiptCard from './ReceiptCard.jsx';

export default function MyReceipts() {
  const receipts = getReceipts();
  return (
    <div className="space-y-5">
      <PageHeader title="My receipts" subtitle="Receipts are stored only in this browser. DigiVote's server cannot list them for you, by design." />
      {receipts.length === 0 && <EmptyState title="No receipts on this device">After you vote, your receipt is saved here and shown on screen. Write the code down to verify from another device.</EmptyState>}
      {receipts.map((r) => <ReceiptCard key={r.electionId} receipt={r} />)}
    </div>
  );
}
