import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useP2pStore } from '../store/p2pStore';

interface ImageLockIndicatorProps {
  imageId: string;
}

export function ImageLockIndicator({ imageId }: ImageLockIndicatorProps) {
  const { t } = useTranslation();
  const { imageLocks, activeSession } = useP2pStore();

  if (!activeSession) return null;

  const lock = imageLocks.get(imageId);
  if (!lock || lock.expiresAt < Date.now()) return null;

  const isMe = lock.lockedBy === activeSession.myNodeId;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`absolute top-1 right-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          isMe
            ? 'bg-green-500/90 text-white'
            : 'bg-orange-500/90 text-white'
        }`}>
          <i className={`fas fa-${isMe ? 'lock-open' : 'lock'} text-[10px]`} />
          <span className="truncate max-w-[60px]">{isMe ? t('p2p.you') : lock.lockedByName}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>
          {isMe
            ? t('p2p.lockedByYou')
            : t('p2p.lockedByOther', { name: lock.lockedByName })
          }
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
