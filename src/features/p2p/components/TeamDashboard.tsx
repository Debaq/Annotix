import { useTranslation } from 'react-i18next';
import { useP2pStore } from '../store/p2pStore';

export function TeamDashboard() {
  const { t } = useTranslation();
  const { peers, workStats } = useP2pStore();

  const totalMembers = peers.length + 1;
  const totalAnnotated = workStats.reduce(
    (sum, s) => sum + s.imagesCompleted + s.videosCompleted,
    0
  );
  const totalItems = workStats.reduce(
    (sum, s) => sum + s.imagesAssigned + s.videosAssigned,
    0
  );
  const overallProgress = totalItems > 0
    ? Math.round((totalAnnotated / totalItems) * 1000) / 10
    : 0;

  const cards = [
    {
      icon: 'fa-users',
      color: 'text-blue-500 bg-blue-500/10',
      label: t('p2p.totalMembers'),
      value: totalMembers,
    },
    {
      icon: 'fa-check-circle',
      color: 'text-green-500 bg-green-500/10',
      label: t('p2p.totalAnnotated'),
      value: totalAnnotated,
    },
    {
      icon: 'fa-chart-pie',
      color: 'text-violet-500 bg-violet-500/10',
      label: t('p2p.overallProgress'),
      value: `${overallProgress}%`,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-lg border bg-card p-4 flex items-center gap-3"
        >
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.color}`}>
            <i className={`fas ${card.icon}`} />
          </div>
          <div>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
