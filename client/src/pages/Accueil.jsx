import React from 'react';
import { Users, GraduationCap, School, Wallet, AlertTriangle, TrendingUp, CalendarX, NotebookPen, ArrowRight, Percent, Clock, Megaphone, FileText } from 'lucide-react';
import { useApp, useFetch, PageHead, Kpi, Card, Badge, Loading, Empty, ErrorBox, Meter } from '../ui/core.jsx';
import { Bars, Lines } from '../ui/charts.jsx';
import { navigate } from '../lib/router.js';
import { money, pct, num, note, date, dateLong, hhmm, JOURS, moyenneTone, relative } from '../lib/format.js';
import { openFile } from '../lib/api.js';

export default function Accueil() {
  const { user } = useApp();
  const prenom = user.nom.replace(/^(M\.|Mme)\s+/, '').split(' ')[0];
  const head = <PageHead eyebrow={dateLong(new Date())} title={`Bonjour ${prenom}`} subtitle={SOUS_TITRES[user.role]} />;
  const Body = { admin: Direction, directeur: Direction, superadmin: Direction, comptable: Comptable, enseignant: Enseignant, parent: Parent, eleve: EleveHome }[user.role];
  return <>{head}<Body /></>;
}

const SOUS_TITRES = {
  admin: 'Vue d\'ensemble de l\'établissement et points d\'attention du jour.',
  directeur: 'Les indicateurs clés et les alertes qui demandent une décision.',
  superadmin: 'Vous consultez cet établissement en mode assistance.',
  comptable: 'Situation de trésorerie et recouvrement des frais de scolarité.',
  enseignant: 'Vos cours, vos classes et les travaux à corriger.',
  parent: 'La scolarité de vos enfants en un coup d\'œil.',
  eleve: 'Ton emploi du temps et tes devoirs à venir.'
};

function Direction() {
  const g = useFetch('/bi/general');
  const f = useFetch('/bi/finances');
  const r = useFetch('/bi/risques');
  const p = useFetch('/bi/pedagogie');
  if (g.loading) return <Loading />;
  if (g.error) return <ErrorBox error={g.error} />;
  const k = g.data.kpis;
  return (
    <>
      <div className="kpis">
        <Kpi icon={Users} label="Élèves inscrits" value={num(k.eleves)} hint={`${k.filles} filles · ${k.garcons} garçons`} />
        <Kpi icon={GraduationCap} label="Enseignants" value={num(k.enseignants)} hint={`${num(k.ratioEleveEnseignant, 1)} élèves par enseignant`} />
        <Kpi icon={School} label="Taux de remplissage" value={pct(k.tauxRemplissage)} hint={`${k.eleves} / ${k.capaciteClasses} places · ${k.classes} classes`} tone={k.tauxRemplissage > 95 ? 'warning' : ''} />
        <Kpi icon={Wallet} label="Recouvrement exigible" value={f.data ? pct(f.data.kpis.tauxRecouvrementExigible) : '…'} hint={f.data ? `${money(f.data.kpis.encaisse)} encaissés` : ''} tone="info" />
        <Kpi icon={TrendingUp} label="Moyenne générale" value={p.data ? note(p.data.kpis.moyenneGenerale) : '…'} hint={p.data ? `Réussite ${pct(p.data.kpis.tauxReussite)} · T${p.data.trimestre}` : ''} tone="success" />
        <Kpi icon={AlertTriangle} label="Élèves à risque élevé" value={r.data ? num(r.data.kpis.risqueEleve) : '…'} hint="Système d'alerte précoce" tone="danger" />
      </div>
      <div className="grid g-2-1">
        <Card title="Effectifs et capacité par niveau" sub="Élèves inscrits comparés aux places disponibles">
          <Bars data={g.data.parNiveau} x="niveau" series={[{ key: 'eleves', name: 'Élèves' }, { key: 'capacite', name: 'Capacité', color: 'var(--border-strong)' }]} />
        </Card>
        <Card title="Alertes prioritaires" sub="Générées automatiquement" actions={<button className="btn sm" onClick={() => navigate('/bi/risques')}>Tout voir<ArrowRight size={14} /></button>}>
          <div className="list">
            {r.data?.alertes.slice(0, 5).map((a, i) => (
              <div className="list-item" key={i}>
                <div className="ico" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><AlertTriangle size={16} /></div>
                <div style={{ minWidth: 0 }}><b className="small">{a.eleve} <span className="muted">· {a.classe}</span></b><div className="small muted">{a.message}</div></div>
              </div>
            ))}
            {g.data.alertes.slice(0, 3).map((a, i) => (
              <div className="list-item" key={`c${i}`}>
                <div className="ico" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}><School size={16} /></div>
                <div className="small">{a.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {f.data && (
        <Card className="mt" title="Encaissements mensuels" sub="Comparaison avec l'année précédente" actions={<button className="btn sm" onClick={() => navigate('/bi')}>Module décisionnel<ArrowRight size={14} /></button>}>
          <Lines data={f.data.mensuel} x="mois" fmt={v => `${Math.round(v / 1000)}k`} series={[{ key: 'annee', name: 'Année en cours' }, { key: 'precedente', name: 'Année précédente', color: 'var(--text-3)', dashed: true }]} />
        </Card>
      )}
    </>
  );
}

function Comptable() {
  const f = useFetch('/bi/finances');
  if (f.loading) return <Loading />;
  if (f.error) return <ErrorBox error={f.error} />;
  const k = f.data.kpis;
  return (
    <>
      <div className="kpis">
        <Kpi icon={Wallet} label="Frais attendus" value={money(k.attendu)} />
        <Kpi icon={TrendingUp} label="Encaissé" value={money(k.encaisse)} hint={`${pct(k.tauxRecouvrement)} du total annuel`} tone="success" />
        <Kpi icon={Percent} label="Recouvrement exigible" value={pct(k.tauxRecouvrementExigible)} hint={`sur ${money(k.exigible)} exigibles à ce jour`} tone="info" />
        <Kpi icon={AlertTriangle} label="Retards de paiement" value={money(k.retardTotal)} hint={`${k.nbRetardataires} familles concernées`} tone="danger" />
      </div>
      <div className="grid g-2-1">
        <Card title="Encaissements et dépenses" sub="Par mois de l'année scolaire">
          <Bars data={f.data.mensuel} x="mois" fmt={v => `${Math.round(v / 1000)}k`} series={[{ key: 'annee', name: 'Encaissements' }, { key: 'depenses', name: 'Dépenses', color: 'var(--c2)' }]} />
        </Card>
        <Card title="Plus gros retards" actions={<button className="btn sm" onClick={() => navigate('/finances')}>Relancer<ArrowRight size={14} /></button>}>
          <div className="list">
            {f.data.retardataires.slice(0, 6).map(x => (
              <div className="list-item" key={x.eleveId}>
                <div style={{ flex: 1 }}><b className="small">{x.eleve}</b><div className="small muted">{x.classe} · {x.parent}</div></div>
                <Badge tone="danger">{money(x.retard)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function jourCourant() {
  const d = new Date().getDay();
  return JOURS[d >= 1 && d <= 5 ? d - 1 : 0];
}

function Enseignant() {
  const { user } = useApp();
  const em = useFetch('/emplois');
  const dv = useFetch('/devoirs');
  const cl = useFetch('/classes');
  if (em.loading) return <Loading />;
  const mes = (em.data || []).filter(e => String(e.enseignant_id) === user.id);
  const jour = jourCourant();
  const aujourdhui = mes.filter(e => e.jour === jour).sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const heures = mes.reduce((s, e) => s + (parseInt(e.fin) * 60 + +String(e.fin).slice(3, 5) - parseInt(e.debut) * 60 - +String(e.debut).slice(3, 5)) / 60, 0);
  const aCorriger = (dv.data || []).filter(d => d.nb_rendus > 0);
  const titulaire = (cl.data || []).filter(c => String(c.enseignant_titulaire_id) === user.id);
  return (
    <>
      <div className="kpis">
        <Kpi icon={Clock} label="Heures par semaine" value={num(heures, 1)} unit="h" />
        <Kpi icon={School} label="Classes" value={new Set(mes.map(e => e.classe_id)).size} hint={titulaire.length ? `Titulaire de ${titulaire.map(c => `${c.niveau} ${c.section}`).join(', ')}` : ''} />
        <Kpi icon={NotebookPen} label="Devoirs publiés" value={(dv.data || []).length} hint={`${aCorriger.length} avec des dépôts`} tone="info" />
      </div>
      <div className="grid g2">
        <Card title={`Mes cours – ${jour}`} actions={<button className="btn sm" onClick={() => navigate('/emplois')}>Semaine<ArrowRight size={14} /></button>}>
          {aujourdhui.length ? <div className="list">{aujourdhui.map(e => (
            <div className="list-item" key={e.id}>
              <div className="ico"><Clock size={16} /></div>
              <div style={{ flex: 1 }}><b className="small">{e.matiere_nom} · {e.classe_nom}</b><div className="small muted">{hhmm(e.debut)} – {hhmm(e.fin)} · {e.salle_nom || 'Salle non définie'}</div></div>
            </div>))}</div> : <Empty title="Aucun cours aujourd'hui" />}
        </Card>
        <Card title="Devoirs récents" actions={<button className="btn sm" onClick={() => navigate('/devoirs')}>Corriger<ArrowRight size={14} /></button>}>
          <div className="list">{(dv.data || []).slice(0, 6).map(d => (
            <div className="list-item" key={d.id}>
              <div style={{ flex: 1 }}><b className="small">{d.titre}</b><div className="small muted">{d.classe_nom} · à rendre le {date(d.date_remise)}</div><div className="mt" style={{ marginTop: 6 }}><Meter value={d.nb_rendus} max={d.nb_eleves} /></div></div>
              <Badge>{d.nb_rendus}/{d.nb_eleves}</Badge>
            </div>))}</div>
        </Card>
      </div>
    </>
  );
}

function ChildCard({ enfant }) {
  const b = useFetch(`/bulletin/${enfant.id}?trimestre=1`);
  const s = useFetch(`/eleves/${enfant.id}/situation`);
  const a = useFetch(`/absences?eleve_id=${enfant.id}`);
  const nbAbs = (a.data || []).filter(x => x.type !== 'Retard').length;
  const m = b.data?.moyenneGenerale;
  return (
    <Card title={`${enfant.prenom} ${enfant.nom}`} sub={enfant.classe || 'Classe non affectée'}
      actions={<button className="btn sm" onClick={() => openFile(`/bulletin/${enfant.id}?trimestre=1&format=pdf`)}><FileText size={14} />Bulletin PDF</button>}>
      <div className="grid g3">
        <div><div className="muted small strong">Moyenne T1</div><div className="big-score" style={{ fontSize: 30, color: m != null && m < 10 ? 'var(--danger)' : undefined }}>{note(m)}</div><div className="small muted">{b.data?.mention}{b.data?.rang ? ` · ${b.data.rang}e / ${b.data.effectif}` : ''}</div></div>
        <div><div className="muted small strong">Absences</div><div className="big-score" style={{ fontSize: 30, color: 'var(--text)' }}>{nbAbs}</div><div className="small muted">{(a.data || []).filter(x => x.statut === 'Non justifiée' && x.type !== 'Retard').length} non justifiée(s)</div></div>
        <div><div className="muted small strong">Solde restant</div><div className="big-score" style={{ fontSize: 24, color: s.data?.reste > 0 ? 'var(--warning)' : 'var(--success)' }}>{s.data ? money(s.data.reste) : '…'}</div><div className="small muted">{s.data ? `${money(s.data.paye)} payés sur ${money(s.data.du)}` : ''}</div></div>
      </div>
      {b.data && <div className="mt"><Bars height={170} data={b.data.lignes.filter(l => l.moyenne != null)} x="matiere" series={[{ key: 'moyenne', name: 'Moyenne' }]} refLine={10} colorBy={d => d.moyenne < 10 ? 'var(--danger)' : 'var(--c1)'} fmt={v => num(v, 0)} /></div>}
    </Card>
  );
}

function Parent() {
  const { user } = useApp();
  const an = useFetch('/annonces');
  return (
    <div className="grid g-2-1">
      <div className="stack">
        {user.enfants?.length ? user.enfants.map(e => <ChildCard key={e.id} enfant={e} />) : <Empty title="Aucun enfant rattaché" />}
      </div>
      <Card title="Annonces de l'école">
        <div className="list">{(an.data || []).slice(0, 5).map(a => (
          <div className="list-item" key={a.id}><div className="ico"><Megaphone size={16} /></div><div><b className="small">{a.titre}</b><div className="small muted">{relative(a.created_at)}</div><p className="small mt" style={{ marginTop: 4 }}>{a.contenu}</p></div></div>
        ))}</div>
      </Card>
    </div>
  );
}

function EleveHome() {
  const em = useFetch('/emplois');
  const dv = useFetch('/devoirs');
  const rd = useFetch('/devoirs_rendus');
  const nt = useFetch('/notes');
  const jour = jourCourant();
  const cours = (em.data || []).filter(e => e.jour === jour).sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
  const rendus = new Set((rd.data || []).map(r => r.devoir_id));
  const aFaire = (dv.data || []).filter(d => !rendus.has(d.id) && new Date(d.date_remise) >= new Date(new Date().toDateString()));
  return (
    <div className="grid g3">
      <Card title={`Mes cours – ${jour}`}>
        {cours.length ? <div className="list">{cours.map(e => <div className="list-item" key={e.id}><div className="ico"><Clock size={16} /></div><div><b className="small">{e.matiere_nom}</b><div className="small muted">{hhmm(e.debut)}–{hhmm(e.fin)} · {e.salle_nom}</div></div></div>)}</div> : <Empty title="Pas de cours" />}
      </Card>
      <Card title="Devoirs à rendre" actions={<button className="btn sm" onClick={() => navigate('/devoirs')}>Voir<ArrowRight size={14} /></button>}>
        {aFaire.length ? <div className="list">{aFaire.map(d => <div className="list-item" key={d.id}><div className="ico"><NotebookPen size={16} /></div><div><b className="small">{d.titre}</b><div className="small muted">{d.matiere_nom} · pour le {date(d.date_remise)}</div></div></div>)}</div> : <Empty title="Tout est rendu" text="Bravo !" />}
      </Card>
      <Card title="Dernières notes">
        <div className="list">{(nt.data || []).slice(0, 6).map(n => <div className="list-item" key={n.id}><div style={{ flex: 1 }}><b className="small">{n.matiere_nom}</b><div className="small muted">{n.eval} · T{n.trimestre}</div></div><Badge tone={moyenneTone(+n.note)}>{note(n.note)}</Badge></div>)}</div>
      </Card>
    </div>
  );
}
