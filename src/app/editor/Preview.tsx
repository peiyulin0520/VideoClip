import { useEffect, useRef } from 'react';
import { urlFor } from '../../engine/assetUrls';
import { Player } from '../../engine/player';
import { useProjectStore } from '../../store/projectStore';
import { useUI } from '../../store/uiStore';

export function Preview({ projectId, width, height }: { projectId: string; width: number; height: number }) {
  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const player = new Player(
      { videos: [v0.current!, v1.current!], img: img.current! },
      { getProject: () => useProjectStore.getState().project, urlFor: (id) => urlFor(projectId, id) },
    );
    useUI.setState({ player });
    player.seek(0);
    const unsub = useProjectStore.subscribe((s, prev) => {
      if (s.revision !== prev.revision || s.project !== prev.project) player.refresh();
    });
    return () => {
      unsub();
      player.destroy();
      useUI.setState({ player: null });
    };
  }, [projectId]);

  return (
    <div className="stage-wrap">
      <div className="stage" style={{ ['--ratio' as string]: `${width} / ${height}` }} data-testid="stage">
        <video ref={v0} playsInline muted preload="auto" />
        <video ref={v1} playsInline muted preload="auto" />
        <img ref={img} alt="" />
      </div>
    </div>
  );
}
