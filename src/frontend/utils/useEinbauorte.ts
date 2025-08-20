import { useEffect, useMemo, useState } from "react";
import config from "../../../config.json";

type Opt = { id:number; label:string };

export function useEinbauorte(projectId?: number) {
  const [opts, setOpts] = useState<Opt[]>([]);
  const reload = () => {
    if (!projectId) return;
    fetch(`${config.BACKEND_URL}/materialized_einbauorte?project_id=${projectId}`)
      .then(r => r.json()).then(setOpts).catch(()=>{});
  };
  useEffect(reload, [projectId]);

  const id2label = useMemo(() => {
    const m = new Map<number,string>(); opts.forEach(o=>m.set(o.id,o.label)); return m;
  }, [opts]);
  const label2id = useMemo(() => {
    const m = new Map<string,number>(); opts.forEach(o=>m.set(o.label,o.id)); return m;
  }, [opts]);
  const labels = useMemo(() => opts.map(o=>o.label), [opts]);

  return { labels, id2label, label2id, reload };
}
