import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { useApp, useFetch, PageHead, Card, Seg, Loading, Empty, Badge, ErrorBox } from '../ui/core.jsx';
import { post, put, del } from '../lib/api.js';
import { NIVEAUX, note, moyenneTone } from '../lib/format.js';

/**
 * Saisie des notes par classe / matière / trimestre (grille), avec moyenne
 * de matière calculée en direct : 40 % contrôle continu + 60 % examen.
 */
export default function Notes() {
  const { user, toast } = useApp();
  const classes = useFetch('/classes');
  const matieres = useFetch('/matieres');
  const emplois = useFetch(user.role === 'enseignant' ? '/emplois' : null);
  const [classe, setClasse] = useState('');
  const [matiere, setMatiere] = useState('');
  const [trimestre, setTrimestre] = useState(1);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const canWrite = ['admin', 'enseignant', 'superadmin'].includes(user.role);

  // Un enseignant ne voit que les classes / matières qu'il enseigne
  const mesClasses = useMemo(() => {
    let cs = (classes.data || []).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau) || a.section.localeCompare(b.section));
    if (user.role === 'enseignant') {
      const ids = new Set((emplois.data || []).filter(e => String(e.enseignant_id) === user.id).map(e => e.classe_id));
      cs = cs.filter(c => ids.has(c.id) || String(c.enseignant_titulaire_id) === user.id);
    }
    return cs;
  }, [classes.data, emplois.data, user]);
  const mesMatieres = useMemo(() => {
    if (user.role !== 'enseignant') return matieres.data || [];
    const ids = new Set((emplois.data || []).filter(e => String(e.enseignant_id) === user.id && (!classe || String(e.classe_id) === String(classe))).map(e => e.matiere_id));
    return (matieres.data || []).filter(m => ids.has(m.id));
  }, [matieres.data, emplois.data, user, classe]);

  useEffect(() => { if (!classe && mesClasses[0]) setClasse(String(mesClasses[0].id)); }, [mesClasses, classe]);
  useEffect(() => { if (mesMatieres.length && !mesMatieres.some(m => String(m.id) === String(matiere))) setMatiere(String(mesMatieres[0].id)); }, [mesMatieres, matiere]);

  const eleves = useFetch(classe ? `/eleves?classe_id=${classe}&statut=inscrit` : null);
  const notes = useFetch(classe && matiere ? `/notes?classe_id=${classe}&matiere_id=${matiere}&trimestre=${trimestre}` : null);
  useEffect(() => setEdits({}), [classe, matiere, trimestre]);

  const lignes = useMemo(() => (eleves.data || []).map(e => {
    const ns = (notes.data || []).filter(n => n.eleve_id === e.id);
    const cc = ns.filter(n => n.eval === 'Contrôle continu');
    const ex = ns.find(n => n.eval === 'Examen');
    const val = (n, k) => (edits[k] !== undefined ? edits[k] : n ? +n.note : '');
    const cells = [cc[0], cc[1], ex];
    const keys = [`${e.id}-cc0`, `${e.id}-cc1`, `${e.id}-ex`];
    const vals = cells.map((n, i) => val(n, keys[i]));
    const ccVals = vals.slice(0, 2).filter(v => v !== '' && v != null).map(Number);
    const exVal = vals[2] !== '' && vals[2] != null ? Number(vals[2]) : null;
    const ccMoy = ccVals.length ? ccVals.reduce((a, b) => a + b, 0) / ccVals.length : null;
    const moy = ccMoy != null && exVal != null ? ccMoy * 0.4 + exVal * 0.6 : ccMoy ?? exVal;
    return { e, cells, keys, vals, moy };
  }), [eleves.data, notes.data, edits]);

  const sauvegarder = async () => {
    setSaving(true);
    let n = 0;
    try {
      for (const l of lignes) {
        for (let i = 0; i < 3; i++) {
          const k = l.keys[i];
          if (edits[k] === undefined) continue;
          const v = edits[k];
          const exist = l.cells[i];
          if (v === '' || v == null) { if (exist) { await del(`/notes/${exist.id}`); n++; } continue; }
          if (+v < 0 || +v > 20) throw new Error(`Note invalide pour ${l.e.prenom} ${l.e.nom} (0 à 20)`);
          if (exist) await put(`/notes/${exist.id}`, { note: +v });
          else await post('/notes', { eleve_id: l.e.id, matiere_id: +matiere, eval: i === 2 ? 'Examen' : 'Contrôle continu', trimestre, note: +v });
          n++;
        }
      }
      toast(`${n} note(s) enregistrée(s)`);
      setEdits({});
      notes.reload();
    } catch (err) { toast(err.message, 'error'); notes.reload(); }
    finally { setSaving(false); }
  };

  if (classes.loading || matieres.loading) return <Loading />;
  const moyClasse = lignes.filter(l => l.moy != null);
  const nbModifs = Object.keys(edits).length;

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Saisie des notes" subtitle="Deux contrôles continus et un examen par trimestre. Moyenne de la matière = 40 % contrôle continu + 60 % examen ; la moyenne générale applique les coefficients des matières."
        actions={canWrite && <button className="btn primary" disabled={!nbModifs || saving} onClick={sauvegarder}><Save size={16} />{saving ? 'Enregistrement…' : `Enregistrer${nbModifs ? ` (${nbModifs})` : ''}`}</button>} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-tools">
          <select value={classe} onChange={e => setClasse(e.target.value)} aria-label="Classe">{mesClasses.map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}</select>
          <select value={matiere} onChange={e => setMatiere(e.target.value)} aria-label="Matière">{mesMatieres.map(m => <option key={m.id} value={m.id}>{m.nom} (coef. {+m.coef})</option>)}</select>
          <Seg value={trimestre} onChange={setTrimestre} options={[1, 2, 3].map(t => ({ value: t, label: `Trimestre ${t}` }))} />
          <div style={{ flex: 1 }} />
          {moyClasse.length > 0 && <span className="small muted">Moyenne de la classe : <b style={{ color: 'var(--text)' }}>{note(moyClasse.reduce((s, l) => s + l.moy, 0) / moyClasse.length)}</b></span>}
        </div>
      </div>
      <ErrorBox error={notes.error} />
      {!mesClasses.length ? <Empty title="Aucune classe affectée" /> : (
        <Card bodyClass="table-wrap">
          <table className="data">
            <thead><tr><th>Élève</th><th className="num">Contrôle 1</th><th className="num">Contrôle 2</th><th className="num">Examen</th><th className="num">Moyenne</th></tr></thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.e.id}>
                  <td><span className="cell-main">{l.e.nom} {l.e.prenom}</span></td>
                  {l.keys.map((k, i) => (
                    <td key={k} className="num">
                      <input className="input" style={{ width: 84, height: 32, textAlign: 'right', marginLeft: 'auto', display: 'block', borderColor: edits[k] !== undefined ? 'var(--accent)' : undefined }}
                        type="number" min={0} max={20} step={0.25} value={l.vals[i]} disabled={!canWrite}
                        aria-label={`${i === 2 ? 'Examen' : `Contrôle ${i + 1}`} – ${l.e.prenom} ${l.e.nom}`}
                        onChange={e => setEdits(x => ({ ...x, [k]: e.target.value }))} />
                    </td>
                  ))}
                  <td className="num"><Badge tone={moyenneTone(l.moy)}>{note(l.moy)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          {eleves.loading && <Loading />}
        </Card>
      )}
    </>
  );
}
