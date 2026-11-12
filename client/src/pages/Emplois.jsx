import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp, useFetch, PageHead, Seg, Modal, Field, ErrorBox, Loading, Empty } from '../ui/core.jsx';
import { post, put, del } from '../lib/api.js';
import { JOURS, CRENEAUX, hhmm, NIVEAUX } from '../lib/format.js';
import { PALETTE } from '../ui/charts.jsx';

export default function Emplois() {
  const { user, toast, confirm } = useApp();
  const admin = ['admin', 'superadmin'].includes(user.role);
  const em = useFetch('/emplois');
  const classes = useFetch('/classes');
  const users = useFetch(['admin', 'directeur', 'superadmin'].includes(user.role) ? '/users?role=enseignant' : null);
  const matieres = useFetch('/matieres');
  const salles = useFetch('/salles');
  const [mode, setMode] = useState(user.role === 'enseignant' ? 'enseignant' : 'classe');
  const [sel, setSel] = useState('');
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const classesTriees = useMemo(() => (classes.data || []).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau) || a.section.localeCompare(b.section)), [classes.data]);
  const visibles = useMemo(() => {
    if (user.role === 'parent') return classesTriees.filter(c => user.enfants?.some(e => e.classe_id === c.id));
    if (user.role === 'eleve') return classesTriees.filter(c => (em.data || []).some(e => e.classe_id === c.id));
    return classesTriees;
  }, [classesTriees, user, em.data]);

  const courant = sel || (mode === 'classe' ? visibles[0]?.id : user.role === 'enseignant' ? user.id : users.data?.[0]?.id);
  const slots = (em.data || []).filter(e => String(mode === 'classe' ? e.classe_id : e.enseignant_id) === String(courant));
  const couleur = useMemo(() => {
    const m = {};
    (matieres.data || []).forEach((x, i) => { m[x.id] = PALETTE[i % PALETTE.length]; });
    return m;
  }, [matieres.data]);

  if (em.loading || classes.loading) return <Loading />;

  const ouvrir = (jour, deb, fin, existant) => {
    setError(null);
    setForm(existant ? { ...existant, debut: hhmm(existant.debut), fin: hhmm(existant.fin) }
      : { jour, debut: deb, fin, classe_id: mode === 'classe' ? courant : visibles[0]?.id, enseignant_id: mode === 'enseignant' ? courant : '', matiere_id: matieres.data?.[0]?.id, salle_id: '' });
  };
  const enregistrer = async e => {
    e.preventDefault();
    const body = { classe_id: +form.classe_id, matiere_id: +form.matiere_id, enseignant_id: +form.enseignant_id, salle_id: form.salle_id ? +form.salle_id : null, jour: form.jour, debut: form.debut, fin: form.fin };
    try {
      if (form.id) await put(`/emplois/${form.id}`, body); else await post('/emplois', body);
      toast('Créneau enregistré');
      setForm(null); em.reload();
    } catch (err) { setError(err); }
  };
  const supprimer = async () => {
    if (!(await confirm({ title: 'Supprimer le créneau', message: 'Ce cours sera retiré de l\'emploi du temps.', danger: true, confirmLabel: 'Supprimer' }))) return;
    await del(`/emplois/${form.id}`); toast('Créneau supprimé'); setForm(null); em.reload();
  };

  const options = mode === 'classe'
    ? visibles.map(c => ({ value: c.id, label: `${c.niveau} ${c.section}` }))
    : user.role === 'enseignant' ? [{ value: user.id, label: user.nom }] : (users.data || []).map(u => ({ value: u.id, label: u.nom }));

  return (
    <>
      <PageHead eyebrow="Scolarité" title="Emploi du temps"
        subtitle={admin ? 'Cliquez sur un créneau libre pour planifier un cours. Les conflits (enseignant, salle ou classe déjà occupés) sont détectés automatiquement.' : 'Vue hebdomadaire des cours.'}
        actions={<>
          {['admin', 'directeur', 'superadmin', 'enseignant'].includes(user.role) && <Seg value={mode} onChange={v => { setMode(v); setSel(''); }} options={[{ value: 'classe', label: 'Par classe' }, { value: 'enseignant', label: 'Par enseignant' }]} />}
          <select className="input" style={{ width: 'auto', minWidth: 180 }} value={courant || ''} onChange={e => setSel(e.target.value)} aria-label="Sélection">
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </>} />
      {!options.length ? <Empty title="Aucun emploi du temps" /> : (
        <div className="table-wrap">
          <div className="timetable" style={{ minWidth: 760 }}>
            <div className="h" />
            {JOURS.map(j => <div key={j} className="h">{j}</div>)}
            {CRENEAUX.map(([deb, fin]) => (
              <React.Fragment key={deb}>
                <div className="t"><span>{deb}</span><span style={{ fontWeight: 500 }}>{fin}</span></div>
                {JOURS.map(j => {
                  const s = slots.find(x => x.jour === j && hhmm(x.debut) === deb);
                  return (
                    <div key={j} className="c">
                      {s ? (
                        <div className={`slot ${admin ? 'clickable' : ''}`} style={{ '--c': couleur[s.matiere_id] || 'var(--c1)' }} onClick={admin ? () => ouvrir(j, deb, fin, s) : undefined}>
                          <b>{s.matiere_nom}</b>
                          <span>{mode === 'classe' ? s.enseignant_nom : s.classe_nom}</span>
                          <span>{s.salle_nom || '—'}</span>
                        </div>
                      ) : admin ? <div className="slot-empty" onClick={() => ouvrir(j, deb, fin)} role="button" aria-label={`Ajouter un cours ${j} ${deb}`}><Plus size={16} /></div> : null}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
      {form && (
        <Modal title={form.id ? 'Modifier le créneau' : 'Planifier un cours'} onClose={() => setForm(null)}
          footer={<>
            {form.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={supprimer}><Trash2 size={15} />Supprimer</button>}
            <button className="btn" onClick={() => setForm(null)}>Annuler</button>
            <button className="btn primary" form="emploi">Enregistrer</button>
          </>}>
          <form id="emploi" className="stack" onSubmit={enregistrer}>
            <ErrorBox error={error} />
            <div className="form-grid">
              <Field label="Jour" required><select value={form.jour} onChange={e => setForm({ ...form, jour: e.target.value })}>{JOURS.map(j => <option key={j}>{j}</option>)}</select></Field>
              <Field label="Classe" required><select value={form.classe_id} onChange={e => setForm({ ...form, classe_id: e.target.value })}>{classesTriees.map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}</select></Field>
              <Field label="Début" required><input type="time" value={form.debut} onChange={e => setForm({ ...form, debut: e.target.value })} required /></Field>
              <Field label="Fin" required><input type="time" value={form.fin} onChange={e => setForm({ ...form, fin: e.target.value })} required /></Field>
              <Field label="Matière" required><select value={form.matiere_id} onChange={e => setForm({ ...form, matiere_id: e.target.value })}>{(matieres.data || []).map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}</select></Field>
              <Field label="Enseignant" required><select value={form.enseignant_id} onChange={e => setForm({ ...form, enseignant_id: e.target.value })} required><option value="">Sélectionner…</option>{(users.data || []).map(u => <option key={u.id} value={u.id}>{u.nom}</option>)}</select></Field>
              <Field label="Salle" full><select value={form.salle_id || ''} onChange={e => setForm({ ...form, salle_id: e.target.value })}><option value="">—</option>{(salles.data || []).map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Field>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
