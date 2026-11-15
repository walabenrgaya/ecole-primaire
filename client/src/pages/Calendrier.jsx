import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock, MapPin, User, Trash2, Pencil, NotebookPen, ArrowRight } from 'lucide-react';
import { useApp, useFetch, PageHead, Seg, Card, Badge, Modal, Field, ErrorBox, Loading, Empty } from '../ui/core.jsx';
import { post, put, api } from '../lib/api.js';
import { NIVEAUX, hhmm, isoDate } from '../lib/format.js';
import { navigate } from '../lib/router.js';

/* ----------------------------- Catégories ----------------------------- */
export const CATEGORIES = {
  'Devoir à rendre': { couleur: 'var(--c5)', court: 'Devoir' },
  'Contrôle': { couleur: 'var(--c1)', court: 'Contrôle' },
  'Devoir surveillé': { couleur: 'var(--c3)', court: 'DS' },
  'Examen': { couleur: 'var(--c4)', court: 'Examen' },
  'Oral de synthèse': { couleur: 'var(--c7)', court: 'Oral' },
  'Événement': { couleur: 'var(--c2)', court: 'Événement' },
  'Vacances': { couleur: 'var(--c6)', court: 'Vacances' }
};
const EVALUATIONS = ['Contrôle', 'Devoir surveillé', 'Examen', 'Oral de synthèse'];
const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const jour = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const cle = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const ajouter = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const lundi = d => { const x = jour(d); const k = (x.getDay() + 6) % 7; return ajouter(x, -k); };
const dateLongue = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Fusionne évaluations / événements et devoirs à rendre en une liste d'échéances.
 * Chaque item : { id, type, titre, debut(Date), fin(Date), heure, classe, ... }
 */
function useEcheances() {
  const ev = useFetch('/evenements');
  const dv = useFetch('/devoirs');
  const items = useMemo(() => {
    const out = [];
    for (const e of ev.data || []) {
      out.push({ ...e, key: `e${e.id}`, type: e.categorie, debutJ: jour(e.date), finJ: jour(e.date_fin || e.date), source: 'evenement' });
    }
    for (const d of dv.data || []) {
      out.push({ key: `d${d.id}`, id: d.id, type: 'Devoir à rendre', titre: d.titre, description: d.desc_devoir, classe_id: d.classe_id, classe_nom: d.classe_nom,
        matiere_nom: d.matiere_nom, enseignant_nom: d.enseignant_nom, debutJ: jour(d.date_remise), finJ: jour(d.date_remise), source: 'devoir' });
    }
    return out.sort((a, b) => a.debutJ - b.debutJ || String(a.debut || '').localeCompare(String(b.debut || '')));
  }, [ev.data, dv.data]);
  return { items, loading: ev.loading || dv.loading, error: ev.error || dv.error, reload: () => { ev.reload(); dv.reload(); } };
}

const surJour = (it, d) => it.debutJ <= d && it.finJ >= d;

export default function Calendrier() {
  const { user } = useApp();
  const { items, loading, error, reload } = useEcheances();
  const classes = useFetch(['parent', 'eleve'].includes(user.role) ? null : '/classes');
  const [vue, setVue] = useState('mois');
  const [ref, setRef] = useState(() => jour(new Date()));
  const [classe, setClasse] = useState('');
  const [enfant, setEnfant] = useState('');
  const [types, setTypes] = useState(() => new Set(Object.keys(CATEGORIES)));
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const peutPlanifier = ['admin', 'directeur', 'enseignant', 'superadmin'].includes(user.role);

  const classesTriees = useMemo(() => (classes.data || []).sort((a, b) => NIVEAUX.indexOf(a.niveau) - NIVEAUX.indexOf(b.niveau) || a.section.localeCompare(b.section)), [classes.data]);
  const classeEnfant = user.role === 'parent' && enfant ? user.enfants.find(e => String(e.id) === enfant)?.classe_id : null;
  const visibles = items.filter(it => types.has(it.type)
    && (!classe || !it.classe_id || String(it.classe_id) === classe)
    && (!classeEnfant || !it.classe_id || it.classe_id === classeEnfant));

  const deplacer = n => setRef(r => (vue === 'mois' ? new Date(r.getFullYear(), r.getMonth() + n, 1) : ajouter(r, 7 * n)));
  const titrePeriode = vue === 'mois'
    ? `${MOIS[ref.getMonth()]} ${ref.getFullYear()}`
    : `Semaine du ${lundi(ref).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  const toggle = t => setTypes(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const planifier = date => setForm({ categorie: 'Contrôle', titre: '', date: cle(date || new Date()), debut: '08:30', fin: '09:15', classe_id: classe || '', matiere_id: '', salle_id: '', description: '', date_fin: '' });

  if (loading) return <Loading />;

  return (
    <>
      <PageHead eyebrow="Pédagogie" title="Calendrier scolaire"
        subtitle="Toutes les échéances en un coup d'œil : devoirs à rendre, contrôles, devoirs surveillés, examens, oraux de synthèse, événements et vacances."
        actions={peutPlanifier && <button className="btn primary" onClick={() => planifier(null)}><Plus size={16} />{user.role === 'enseignant' ? 'Planifier une évaluation' : 'Ajouter au calendrier'}</button>} />
      <ErrorBox error={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="table-tools">
          <div className="row" style={{ gap: 6 }}>
            <button className="btn sm icon" onClick={() => deplacer(-1)} aria-label="Période précédente"><ChevronLeft size={16} /></button>
            <button className="btn sm" onClick={() => setRef(jour(new Date()))}>Aujourd'hui</button>
            <button className="btn sm icon" onClick={() => deplacer(1)} aria-label="Période suivante"><ChevronRight size={16} /></button>
            <b style={{ marginLeft: 6, textTransform: vue === 'liste' ? 'none' : 'capitalize', fontSize: 15 }}>{vue === 'liste' ? 'Prochaines échéances' : titrePeriode}</b>
          </div>
          <div style={{ flex: 1 }} />
          {classesTriees.length > 0 && (
            <select value={classe} onChange={e => setClasse(e.target.value)} aria-label="Filtrer par classe">
              <option value="">Toutes les classes</option>
              {classesTriees.map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
            </select>
          )}
          {user.role === 'parent' && user.enfants?.length > 1 && (
            <select value={enfant} onChange={e => setEnfant(e.target.value)} aria-label="Enfant">
              <option value="">Tous mes enfants</option>
              {user.enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} ({e.classe})</option>)}
            </select>
          )}
          <Seg value={vue} onChange={setVue} options={[{ value: 'mois', label: 'Mois' }, { value: 'semaine', label: 'Semaine' }, { value: 'liste', label: 'À venir' }]} />
        </div>
        <div className="cal-legend">
          {Object.entries(CATEGORIES).map(([t, c]) => (
            <button key={t} className={`cal-chip ${types.has(t) ? '' : 'off'}`} style={{ '--c': c.couleur }} onClick={() => toggle(t)} aria-pressed={types.has(t)}>
              <i />{t}
            </button>
          ))}
        </div>
      </div>

      {vue === 'mois' && <VueMois ref_={ref} items={visibles} onItem={setDetail} onJour={peutPlanifier ? planifier : null} />}
      {vue === 'semaine' && <VueSemaine ref_={ref} items={visibles} onItem={setDetail} />}
      {vue === 'liste' && <VueListe items={visibles} onItem={setDetail} />}

      {detail && <Detail item={detail} onClose={() => setDetail(null)} onEdit={it => { setDetail(null); setForm({ ...it, date: isoDate(it.date), date_fin: it.date_fin ? isoDate(it.date_fin) : '', debut: hhmm(it.debut), fin: hhmm(it.fin) }); }} onDeleted={() => { setDetail(null); reload(); }} />}
      {form && <Formulaire initial={form} classes={classesTriees} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </>
  );
}

/* ------------------------------- Vues ------------------------------- */
function Pastille({ it, onClick, compact }) {
  const c = CATEGORIES[it.type]?.couleur || 'var(--c1)';
  return (
    <button className="cal-ev" style={{ '--c': c }} onClick={e => { e.stopPropagation(); onClick(it); }} title={`${it.type} – ${it.titre}`}>
      {!compact && it.debut && <span className="h">{hhmm(it.debut)}</span>}
      <span className="t">{it.type === 'Vacances' || it.type === 'Événement' ? it.titre : `${CATEGORIES[it.type]?.court} · ${it.matiere_nom || it.titre}`}</span>
    </button>
  );
}

function VueMois({ ref_, items, onItem, onJour }) {
  const debut = lundi(new Date(ref_.getFullYear(), ref_.getMonth(), 1));
  const jours = Array.from({ length: 42 }, (_, i) => ajouter(debut, i));
  const aujourdhui = cle(new Date());
  return (
    <div className="cal-month card">
      {JOURS_COURTS.map(j => <div key={j} className="cal-head">{j}</div>)}
      {jours.map(d => {
        const evs = items.filter(it => surJour(it, d));
        const horsMois = d.getMonth() !== ref_.getMonth();
        const vacances = evs.some(e => e.type === 'Vacances');
        return (
          <div key={cle(d)} className={`cal-day ${horsMois ? 'out' : ''} ${cle(d) === aujourdhui ? 'today' : ''} ${vacances ? 'holiday' : ''} ${onJour ? 'clickable' : ''}`}
            onClick={onJour && !horsMois ? () => onJour(d) : undefined}>
            <span className="num">{d.getDate()}</span>
            {evs.slice(0, 3).map(it => <Pastille key={it.key} it={it} onClick={onItem} compact />)}
            {evs.length > 3 && <span className="more">+{evs.length - 3} autre(s)</span>}
          </div>
        );
      })}
    </div>
  );
}

function VueSemaine({ ref_, items, onItem }) {
  const l = lundi(ref_);
  const jours = Array.from({ length: 6 }, (_, i) => ajouter(l, i));
  const aujourdhui = cle(new Date());
  return (
    <div className="cal-week">
      {jours.map(d => {
        const evs = items.filter(it => surJour(it, d));
        return (
          <div key={cle(d)} className={`card cal-wday ${cle(d) === aujourdhui ? 'today' : ''}`}>
            <div className="cal-wday-head"><b style={{ textTransform: 'capitalize' }}>{d.toLocaleDateString('fr-FR', { weekday: 'long' })}</b><span>{d.getDate()} {MOIS[d.getMonth()].slice(0, 4)}.</span></div>
            {evs.length ? evs.map(it => (
              <button key={it.key} className="cal-block" style={{ '--c': CATEGORIES[it.type]?.couleur }} onClick={() => onItem(it)}>
                <span className="small strong">{it.debut ? `${hhmm(it.debut)}–${hhmm(it.fin)}` : it.type === 'Devoir à rendre' ? 'À rendre' : 'Journée'}</span>
                <b>{it.titre}</b>
                <span className="small muted">{[it.classe_nom, it.salle_nom].filter(Boolean).join(' · ') || it.type}</span>
              </button>
            )) : <span className="small muted" style={{ padding: 8 }}>Rien de prévu</span>}
          </div>
        );
      })}
    </div>
  );
}

function VueListe({ items, onItem }) {
  const auj = jour(new Date());
  const futurs = items.filter(it => it.finJ >= auj).slice(0, 120);
  if (!futurs.length) return <Empty title="Aucune échéance à venir" icon={CalendarDays} />;
  const parJour = futurs.reduce((m, it) => { const k = cle(it.debutJ < auj ? auj : it.debutJ); (m[k] ||= []).push(it); return m; }, {});
  return (
    <div className="stack" style={{ maxWidth: 900 }}>
      {Object.entries(parJour).map(([k, evs]) => (
        <Card key={k} title={<span style={{ textTransform: 'capitalize' }}>{dateLongue(k)}</span>} sub={relatifJours(k)}>
          <div className="list">
            {evs.map(it => <LigneEcheance key={it.key} it={it} onClick={() => onItem(it)} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function relatifJours(k) {
  const n = Math.round((jour(k) - jour(new Date())) / 864e5);
  return n === 0 ? 'Aujourd\'hui' : n === 1 ? 'Demain' : `Dans ${n} jours`;
}

export function LigneEcheance({ it, onClick }) {
  return (
    <div className="list-item" style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick}>
      <div className="ico" style={{ background: `color-mix(in srgb, ${CATEGORIES[it.type]?.couleur} 15%, transparent)`, color: CATEGORIES[it.type]?.couleur }}>
        {it.type === 'Devoir à rendre' ? <NotebookPen size={16} /> : <CalendarDays size={16} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b className="small">{it.titre}</b>
        <div className="small muted">{[it.type, it.classe_nom, it.debut ? `${hhmm(it.debut)}–${hhmm(it.fin)}` : null, it.salle_nom].filter(Boolean).join(' · ')}</div>
      </div>
      <Badge>{CATEGORIES[it.type]?.court}</Badge>
    </div>
  );
}

/* ------------------------------ Détail ------------------------------ */
function Detail({ item, onClose, onEdit, onDeleted }) {
  const { user, toast, confirm } = useApp();
  const modifiable = item.source === 'evenement' && (['admin', 'directeur', 'superadmin'].includes(user.role) || (user.role === 'enseignant' && String(item.enseignant_id) === user.id));
  const supprimer = async () => {
    if (!(await confirm({ title: 'Retirer du calendrier', message: `Supprimer « ${item.titre} » ? Les élèves et parents ne le verront plus.`, danger: true, confirmLabel: 'Supprimer' }))) return;
    try { await api(`/evenements/${item.id}`, { method: 'DELETE' }); toast('Retiré du calendrier'); onDeleted(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <Modal title={item.titre} onClose={onClose} size="narrow"
      footer={<>
        {modifiable && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={supprimer}><Trash2 size={15} />Supprimer</button>}
        {item.source === 'devoir' && <button className="btn" onClick={() => navigate('/devoirs')}>Voir le devoir<ArrowRight size={14} /></button>}
        {modifiable && <button className="btn" onClick={() => onEdit(item)}><Pencil size={15} />Modifier</button>}
        <button className="btn primary" onClick={onClose}>Fermer</button>
      </>}>
      <div className="stack" style={{ gap: 10 }}>
        <div className="row"><Badge tone="accent">{item.type}</Badge>{item.trimestre && <Badge>Trimestre {item.trimestre}</Badge>}</div>
        <div className="row small"><CalendarDays size={15} /><span style={{ textTransform: 'capitalize' }}>{dateLongue(item.debutJ)}{item.finJ > item.debutJ ? ` → ${dateLongue(item.finJ)}` : ''}</span></div>
        {item.debut && <div className="row small"><Clock size={15} />{hhmm(item.debut)} – {hhmm(item.fin)}</div>}
        {(item.classe_nom || item.matiere_nom) && <div className="row small"><NotebookPen size={15} />{[item.classe_nom, item.matiere_nom].filter(Boolean).join(' · ')}</div>}
        {item.salle_nom && <div className="row small"><MapPin size={15} />{item.salle_nom}</div>}
        {item.enseignant_nom && <div className="row small"><User size={15} />{item.enseignant_nom}</div>}
        {item.description && <p style={{ color: 'var(--text-2)', whiteSpace: 'pre-wrap' }}>{item.description}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------- Formulaire ---------------------------- */
function Formulaire({ initial, classes, onClose, onSaved }) {
  const { user, toast } = useApp();
  const matieres = useFetch('/matieres');
  const salles = useFetch('/salles');
  const emplois = useFetch(user.role === 'enseignant' ? '/emplois' : null);
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const evaluation = EVALUATIONS.includes(f.categorie);
  const categories = user.role === 'enseignant' ? EVALUATIONS : [...EVALUATIONS, 'Événement', 'Vacances'];

  // Un enseignant ne voit que ses classes
  const mesClasses = user.role === 'enseignant'
    ? classes.filter(c => (emplois.data || []).some(e => e.classe_id === c.id && String(e.enseignant_id) === user.id) || String(c.enseignant_titulaire_id) === user.id)
    : classes;
  useEffect(() => { if (evaluation && !f.classe_id && mesClasses[0]) set('classe_id', String(mesClasses[0].id)); }, [mesClasses.length, evaluation]); // eslint-disable-line react-hooks/exhaustive-deps

  const enregistrer = async e => {
    e.preventDefault();
    setError(null);
    const body = {
      categorie: f.categorie, titre: f.titre, description: f.description || null, date: f.date,
      date_fin: !evaluation && f.date_fin ? f.date_fin : null,
      debut: f.debut || null, fin: f.fin || null,
      classe_id: f.classe_id ? +f.classe_id : null,
      matiere_id: evaluation && f.matiere_id ? +f.matiere_id : null,
      salle_id: f.salle_id ? +f.salle_id : null
    };
    try {
      if (f.id) await put(`/evenements/${f.id}`, body); else await post('/evenements', body);
      toast(evaluation && !f.id ? 'Évaluation planifiée – élèves et parents notifiés' : 'Calendrier mis à jour');
      onSaved();
    } catch (err) { setError(err); }
  };

  return (
    <Modal title={f.id ? 'Modifier' : evaluation ? 'Planifier une évaluation' : 'Ajouter au calendrier'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Annuler</button><button className="btn primary" form="cal-form">Enregistrer</button></>}>
      <form id="cal-form" className="stack" onSubmit={enregistrer}>
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Type" required>
            <select value={f.categorie} onChange={e => set('categorie', e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select>
          </Field>
          <Field label={evaluation ? 'Classe' : 'Classe (vide = tout l\'établissement)'} required={evaluation}>
            <select value={f.classe_id || ''} onChange={e => set('classe_id', e.target.value)} required={evaluation}>
              {!evaluation && <option value="">Tout l'établissement</option>}
              {evaluation && <option value="">Sélectionner…</option>}
              {mesClasses.map(c => <option key={c.id} value={c.id}>{c.niveau} {c.section}</option>)}
            </select>
          </Field>
          {evaluation && (
            <Field label="Matière" required full>
              <select value={f.matiere_id || ''} onChange={e => { set('matiere_id', e.target.value); const m = matieres.data?.find(x => String(x.id) === e.target.value); if (m && !f.titre) set('titre', `${f.categorie} – ${m.nom}`); }} required>
                <option value="">Sélectionner…</option>
                {(matieres.data || []).map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
              </select>
            </Field>
          )}
          <Field label="Titre" required full><input value={f.titre} onChange={e => set('titre', e.target.value)} required placeholder={evaluation ? 'ex. Contrôle – Les fractions' : 'ex. Sortie pédagogique'} /></Field>
          <Field label={f.categorie === 'Vacances' ? 'Du' : 'Date'} required><input type="date" value={f.date} onChange={e => set('date', e.target.value)} required /></Field>
          {!evaluation && <Field label="Jusqu'au (facultatif)"><input type="date" value={f.date_fin || ''} min={f.date} onChange={e => set('date_fin', e.target.value)} /></Field>}
          {f.categorie !== 'Vacances' && <>
            <Field label="Début"><input type="time" value={f.debut || ''} onChange={e => set('debut', e.target.value)} /></Field>
            <Field label="Fin"><input type="time" value={f.fin || ''} min={f.debut} onChange={e => set('fin', e.target.value)} /></Field>
          </>}
          {f.categorie !== 'Vacances' && <Field label="Salle" full={!evaluation}><select value={f.salle_id || ''} onChange={e => set('salle_id', e.target.value)}><option value="">—</option>{(salles.data || []).map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Field>}
          <Field label="Consignes / description" full><textarea value={f.description || ''} onChange={e => set('description', e.target.value)} placeholder={evaluation ? 'Chapitres concernés, matériel autorisé, durée…' : ''} /></Field>
        </div>
        {evaluation && <p className="small muted">Règles appliquées : pas d'évaluation pendant les vacances, pas de chevauchement pour une même classe, 2 évaluations maximum par jour.</p>}
      </form>
    </Modal>
  );
}

/* ------------------- Widget « Prochaines échéances » ------------------- */
export function ProchainesEcheances({ jours = 14, max = 6 }) {
  const { items, loading } = useEcheances(); // déjà filtrées par le serveur selon le rôle
  const auj = jour(new Date());
  const limite = ajouter(auj, jours);
  const evs = items.filter(it => it.finJ >= auj && it.debutJ <= limite && it.type !== 'Vacances').slice(0, max);
  return (
    <Card title="Prochaines échéances" sub={`${jours} prochains jours`} actions={<button className="btn sm" onClick={() => navigate('/calendrier')}>Calendrier<ArrowRight size={14} /></button>}>
      {loading ? <Loading /> : evs.length ? (
        <div className="list">{evs.map(it => (
          <div key={it.key}>
            <div className="small muted strong" style={{ marginTop: 6, textTransform: 'capitalize' }}>{relatifJours(cle(it.debutJ < auj ? auj : it.debutJ))} · {dateLongue(it.debutJ)}</div>
            <LigneEcheance it={it} onClick={() => navigate('/calendrier')} />
          </div>
        ))}</div>
      ) : <Empty title="Rien de prévu" text="Aucune échéance dans les prochains jours." />}
    </Card>
  );
}
