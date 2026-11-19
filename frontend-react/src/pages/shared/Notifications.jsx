import { Notifications as Api } from '../../api/endpoints.js';
import { useAction, useApi } from '../../hooks/useApi.js';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader } from '../../components/ui.jsx';
import { formatDateTime } from '../../lib/format.js';
import { firebaseConfigured, requestPushToken } from '../../lib/firebase.js';

export default function Notifications() {
  const { data, loading, error, reload } = useApi(() => Api.list());
  const push = useAction();
  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={data ? `${data.unread} unread` : undefined}
        actions={firebaseConfigured && (
          <Button variant="secondary" busy={push.busy} onClick={() => push.run(async () => {
            const token = await requestPushToken();
            if (!token) throw new Error('Push notifications are not available in this browser.');
            await Api.registerDevice(token);
          }, 'Push notifications enabled for this browser.')}>
            Enable push notifications
          </Button>
        )}
      />
      {push.error && <Alert kind="error">{push.error}</Alert>}
      {push.success && <Alert kind="success">{push.success}</Alert>}
      {loading && <Loading />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.page.content.length === 0 && <EmptyState title="No notifications">You will be notified when elections you take part in change state.</EmptyState>}
      {data && data.page.content.length > 0 && (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {data.page.content.map((n) => (
              <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-medium text-navy-900">{n.title} {!n.readAt && <Badge tone="blue">New</Badge>}</p>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt && (
                  <Button size="sm" variant="ghost" onClick={async () => { await Api.markRead(n.id); reload(); }}>Mark read</Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
