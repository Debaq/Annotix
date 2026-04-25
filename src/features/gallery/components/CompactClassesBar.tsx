import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { CLASS_SHORTCUTS } from '../../core/constants';
import { useClassCounts } from '../../projects/hooks/useClassCounts';
import { cn } from '@/lib/utils';

export function CompactClassesBar() {
  const { project } = useCurrentProject();
  const { activeClassId, setActiveClassId } = useUIStore();
  const { byClass: globalByClass } = useClassCounts();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!listRef.current) return;
    if (e.deltaY === 0) return;
    e.preventDefault();
    listRef.current.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    if (activeClassId == null) return;
    const el = itemRefs.current.get(activeClassId);
    const list = listRef.current;
    if (!el || !list) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - list.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }
  }, [activeClassId, project?.classes.length]);

  const setItemRef = (id: number, el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  if (!project || project.classes.length === 0) return null;

  return (
    <div className="annotix-compact-classes" ref={listRef} onWheel={handleWheel}>
      {project.classes.map((cls, index) => (
        <button
          key={cls.id}
          ref={(el) => setItemRef(cls.id, el)}
          onClick={() => setActiveClassId(cls.id)}
          className={cn('annotix-compact-class-item', activeClassId === cls.id && 'active')}
          title={cls.name}
        >
          <span className="annotix-compact-class-key">
            {index < CLASS_SHORTCUTS.length ? CLASS_SHORTCUTS[index] : index + 1}
          </span>
          <span
            className="annotix-compact-class-color"
            style={{ backgroundColor: cls.color }}
          />
          <span className="annotix-compact-class-name">{cls.name}</span>
          <span className="annotix-compact-class-count">{globalByClass[cls.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
