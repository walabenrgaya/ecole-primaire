import React, { useEffect, useMemo, useState } from 'react';
import { FileDown } from 'lucide-react';
import { useApp, useFetch, PageHead, Card, Seg, Loading, Empty, Badge, ErrorBox } from '../ui/core.jsx';
import { Bars } from '../ui/charts.jsx';
import { openFile } from '../lib/api.js';
import { NIVEAUX, note, moyenneTone, num } from '../lib/format.js';

export default function Bulletins() {
  const { user, toast } = useApp();
  const famille = ['parent', 'eleve'].includes(user.role);
  const classes = useFetch(famille ? null : '/classes');
  const [classe, setClasse] = useState('');
  const eleves = useFetch(famille ? '/eleves' : classe ? `/eleves?classe_id=${classe}&statut=inscrit` : null);
  const [eleve, setEleve] = useState('');
  const [periode, setPeriode] = useState('1');

  const cls = useMemo(() => (classes.data || []).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau) || a.section.localeCompare(b.section)), [classes.data]);
  useEffect(() => { if (!classe && cls[0]) setClasse(String(cls[0].id)); }, [cls, classe]);
  useEffect(() => { if (eleves.data?.length && !eleves.data.some(e => String(e.id) === eleve)) setEleve(String(eleves.data[0].id)); }, [eleves.data, eleve]);

  const q = periode === 'annuel' ? '' : `?trimestre=${periode}`;
  const b = useFetch(eleve ? `/bulletin/${eleve}${q}` : null);
  const pdf = () => openFile(`/bulletin/${eleve}${q ? `${q}&` : '?'}format=pdf`).catch(e => toast(e.message, 'error'));

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Bulletins scolaires" subtitle="Moyennes calculées automatiquement avec les coefficients, rang dans la classe et synthèse des absences."
        actions={eleve && <button className="btn primary" onClick={pdf}><FileDown size={16} />Télécharger le PDF</button>} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-tools">
          {!famille && <select value={classe} onChange={e => { setClasse(e.target.value); setEleve(''); }} aria-label="Classe">{cls.map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}</select>}
          {(eleves.data?.length > 1 || !famille) && (
            <select value={eleve} onChange={e => setEleve(e.target.value)} aria-label="Élève">{(eleves.data || []).map(e => <option key={e.id} value={e.id}>{e.nom} {e.prenom}</option>)}</select>
          )}
          <Seg value={periode} onChange={setPeriode} options={[{ value: '1', label: 'T1' }, { value: '2', label: 'T2' }, { value: '3', label: 'T3' }, { value: 'annuel', label: 'Annuel' }]} />
        </div>
      </div>
      <ErrorBox error={b.error} />
      {b.loading ? <Loading /> : !b.data ? <Empty title="Sélectionnez un élève" /> : (
        <div className="grid g-2-1">
          <Card>
            <div className="bulletin-head">
              <div>
                <span className="eyebrow">{b.data.trimestre ? `Trimestre ${b.data.trimestre}` : 'Bilan annuel'} · {b.data.annee}</span>
                <h2 style={{ fontSize: 22, fontWeight: 800 }}>{b.data.eleve.prenom} {b.data.eleve.nom}</h2>
                <div className="muted small">{b.data.classe} · Matricule {b.data.eleve.matricule}</div>
              </div>
              <div className="right">
                <div className="big-score" style={{ color: b.data.moyenneGenerale != null && b.data.moyenneGenerale < 10 ? 'var(--danger)' : undefined }}>{note(b.data.moyenneGenerale)}</div>
                <div className="small strong">{b.data.mention}</div>
              </div>
            </div>
            <table className="data">
              <thead><tr><th>Matière</th><th className="num">Coef.</th><th>Notes</th><th className="num">Moyenne</th></tr></thead>
              <tbody>
                {b.data.lignes.map(l => (
                  <tr key={l.matiere_id}>
                    <td className="cell-main">{l.matiere}</td>
                    <td className="num">{l.coef}</td>
                    <td className="small muted">{l.notes.length ? l.notes.map((n, i) => <span key={i} style={{ marginRight: 10 }}>{n.eval === 'Examen' ? 'Ex.' : 'CC'}{b.data.trimestre ? '' : n.trimestre} <b style={{ color: 'var(--text)' }}>{num(n.note, 2)}</b></span>) : '—'}</td>
                    <td className="num"><Badge tone={moyenneTone(l.moyenne)}>{note(l.moyenne)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="stack">
            <Card title="Synthèse">
              <div className="grid g2">
                <div><div className="muted small strong">Rang</div><div style={{ fontSize: 22, fontWeight: 800 }}>{b.data.rang ? `${b.data.rang}e / ${b.data.effectif}` : '—'}</div></div>
                <div><div className="muted small strong">Moy. de la classe</div><div style={{ fontSize: 22, fontWeight: 800 }}>{note(b.data.moyenneClasse)}</div></div>
                <div><div className="muted small strong">Plus haute / basse</div><div style={{ fontSize: 15, fontWeight: 800 }}>{note(b.data.plusHaute)} / {note(b.data.plusBasse)}</div></div>
                <div><div className="muted small strong">Absences</div><div style={{ fontSize: 15, fontWeight: 800 }}>{b.data.absences.total} <span className="muted small">({b.data.absences.justifiees} justifiées) · {b.data.absences.retards} retard(s)</span></div></div>
              </div>
            </Card>
            <Card title="Profil par matière">
              <Bars height={240} horizontal data={b.data.lignes.filter(l => l.moyenne != null)} x="matiere" series={[{ key: 'moyenne', name: 'Moyenne' }]} refLine={10} colorBy={d => d.moyenne < 10 ? 'var(--danger)' : 'var(--c1)'} />
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
