import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { p2pService } from '../services/p2pService';
import { useP2pStore } from '../store/p2pStore';
import type { PeerInfo } from '../types';

interface BatchAssignDialogProps {
  peers: PeerInfo[];
}

export function BatchAssignDialog({ peers }: BatchAssignDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState('');
  const [imageIdsText, setImageIdsText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { addBatch } = useP2pStore();

  const collaborators = peers.filter(p => p.role === 'collaborator');

  const handleAssign = async () => {
    if (!selectedPeer || !imageIdsText.trim()) return;

    const imageIds = imageIdsText.split(',').map(s => s.trim()).filter(Boolean);
    if (imageIds.length === 0) return;

    setError('');
    setLoading(true);

    try {
      const batch = await p2pService.assignBatch(imageIds, selectedPeer);
      addBatch(batch);
      setOpen(false);
      setImageIdsText('');
      setSelectedPeer('');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <i className="fas fa-tasks mr-2" />
          {t('p2p.assignBatch')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('p2p.assignBatch')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t('p2p.selectCollaborator')}</Label>
            <Select value={selectedPeer} onValueChange={setSelectedPeer}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t('p2p.selectCollaborator')} />
              </SelectTrigger>
              <SelectContent>
                {collaborators.map((p) => (
                  <SelectItem key={p.nodeId} value={p.nodeId}>
                    {p.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('p2p.imageIds')}</Label>
            <Input
              value={imageIdsText}
              onChange={(e) => setImageIdsText(e.target.value)}
              placeholder={t('p2p.imageIdsPlaceholder')}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">{t('p2p.imageIdsHint')}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleAssign} disabled={!selectedPeer || !imageIdsText.trim() || loading}>
              {loading && <i className="fas fa-spinner fa-spin mr-2" />}
              {t('p2p.assign')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
