import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Wallet, GraduationCap, CalendarX, Users, UserPlus, MessagesSquare, DoorOpen, Siren, Compass,
  RefreshCw, Info, Users2, School, Percent, TrendingUp, AlertTriangle, Clock, Target, ThumbsUp, ThumbsDown, Mail, Building
} from 'lucide-react';
import { useFetch, PageHead, Tabs, Kpi, Card, Badge, Loading, ErrorBox, DataTable, Meter, Seg, Empty, Alert } from '../ui/core.jsx';
import { Bars, Lines, Combo, Donut, Scatterplot, Legend, PALETTE } from '../ui/charts.jsx';
import { navigate, useLocation } from '../lib/router.js';
import { money, pct, num, note, compact, relative, moyenneTone } from '../lib/format.js';

const TABLEAUX = [
  { id: 'general', label: 'Vue générale', icon: LayoutDashboard, C: General },
  { id: 'finances', label: 'Finances', icon: Wallet, C: Finances },
  { id: 'pedagogie', label: 'Pédagogie', icon: GraduationCap, C: Pedagogie },
  { id: 'absences', label: 'Absences', icon: CalendarX, C: Absences },
  { id: 'enseignants', label: 'Enseignants', icon: Users, C: Enseignants },
  { id: 'inscriptions', label: 'Inscriptions', icon: UserPlus, C: Inscriptions },
  { id: 'communication', label: 'Communication', icon: MessagesSquare, C: Communication },
  { id: 'ressources', label: 'Ressources', icon: DoorOpen, C: Ressources },
  { id: 'risques', label: 'Alertes précoces', icon: Siren, C: Risques },
  { id: 'strategie', label: 'Stratégie', icon: Compass, C: Strategie }
];
const k$ = v => compact(v);

export default function BI() {
  const path = useLocation();
  const id = path.split('/')[2] || 'general';
  const t = TABLEAUX.find(x => x.id === id) || TABLEAUX[0];
  const [refresh, setRefresh] = useState(0);
  return (
    <>
      <PageHead eyebrow="Business Intelligence & aide à la décision" title={t.label === 'Vue générale' ? 'Tableau de bord de l\'établissement' : `Tableau de bord – ${t.label}`}
        subtitle="Indicateurs calculés en temps réel sur les données de l'établissement pour anticiper les problèmes, détecter les anomalies et décider."
        actions={<button className="btn" onClick={() => setRefresh(r => r + 1)}><RefreshCw size={15} />Actualiser</button>} />
      <Tabs tabs={TABLEAUX} value={t.id} onChange={v => navigate(v === 'general' ? '/bi' : `/bi/${v}`)} />
      <t.C key={`${t.id}-${refresh}`} refresh={refresh} />
    </>
  );
}

function Wrap({ q, children }) {
  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return children(q.data);
}

const Method = ({ children }) => <div className="method"><Info size={13} /><span>{children}</span></div>;

/* ------------------------------ 1. Général ------------------------------ */
function General({ refresh }) {
  const q = useFetch(`/bi/general${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={Users2} label="Élèves" value={num(d.kpis.eleves)} hint={`${d.kpis.filles} F · ${d.kpis.garcons} G`} />
        <Kpi icon={GraduationCap} label="Enseignants" value={d.kpis.enseignants} hint={`${num(d.kpis.ratioEleveEnseignant, 1)} élèves / enseignant`} />
        <Kpi icon={School} label="Classes" value={d.kpis.classes} />
        <Kpi icon={Percent} label="Remplissage" value={pct(d.kpis.tauxRemplissage)} hint={`${d.kpis.eleves} / ${d.kpis.capaciteClasses} places`} tone={d.kpis.tauxRemplissage > 95 ? 'warning' : 'info'} />
        <Kpi icon={Building} label="Capacité d'accueil" value={num(d.kpis.capaciteAccueil)} hint={`${pct((d.kpis.eleves / d.kpis.capaciteAccueil) * 100)} utilisée`} />
      </div>
      <div className="grid g-2-1">
        <Card title="Répartition par niveau" sub="Élèves inscrits et capacité d'accueil">
          <Bars data={d.parNiveau} x="niveau" series={[{ key: 'eleves', name: 'Élèves' }, { key: 'capacite', name: 'Capacité', color: 'var(--border-strong)' }]} />
        </Card>
        <Card title="Évolution des inscriptions" sub="Effectif total et nouveaux élèves par année">
          <Combo data={d.evolution} x="annee" bars={[{ key: 'nouveaux', name: 'Nouveaux', color: 'var(--c2)' }]} lines={[{ key: 'effectif', name: 'Effectif', color: 'var(--c1)' }]} />
        </Card>
      </div>
      <div className="grid g-2-1 mt">
        <Card title="Effectif et capacité par classe" bodyClass="card-body">
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Classe</th><th className="num">Effectif</th><th style={{ width: '40%' }}>Remplissage</th><th>Alerte</th></tr></thead>
            <tbody>{d.classes.map(c => (
              <tr key={c.id}><td className="cell-main">{c.classe}</td><td className="num">{c.effectif} / {c.capacite}</td>
                <td><Meter value={c.effectif} max={c.capacite} tone={c.taux >= 100 ? 'danger' : c.taux < 60 ? 'warning' : ''} /></td>
                <td>{c.alerte ? <Badge tone={c.alerte === 'sous-remplie' ? 'info' : 'danger'} dot>{c.alerte}</Badge> : <Badge tone="success" dot>normale</Badge>}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
        <Card title="Alertes de capacité">
          {d.alertes.length ? <div className="list">{d.alertes.map((a, i) => <div className="list-item" key={i}><div className="ico" style={{ color: a.niveau === 'info' ? 'var(--info)' : 'var(--warning)' }}><AlertTriangle size={16} /></div><span className="small">{a.message}</span></div>)}</div> : <Empty title="Aucune alerte" />}
          <Method>Classe saturée ≥ 95 %, sous-remplie &lt; 60 % de la capacité.</Method>
        </Card>
      </div>
    </>
  )}</Wrap>;
}

/* ------------------------------ 2. Finances ----------------------------- */
function Finances({ refresh }) {
  const q = useFetch(`/bi/finances${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => {
    const prev = [...d.mensuel.map(m => ({ mois: m.mois, reel: m.annee })),];
    d.prevision.forEach(p => { const x = prev.find(m => m.mois === p.mois); if (x) Object.assign(x, { prevision: p.prevision, haute: p.haute, basse: p.basse }); });
    return (
      <>
        <div className="kpis">
          <Kpi icon={Wallet} label="Frais attendus" value={money(d.kpis.attendu)} />
          <Kpi icon={TrendingUp} label="Encaissé" value={money(d.kpis.encaisse)} hint={`${pct(d.kpis.tauxRecouvrement)} du total annuel`} tone="success" />
          <Kpi icon={Target} label="Reste à payer" value={money(d.kpis.reste)} />
          <Kpi icon={Percent} label="Recouvrement exigible" value={pct(d.kpis.tauxRecouvrementExigible)} hint={`${money(d.kpis.exigible)} exigibles à ce jour`} tone="info" />
          <Kpi icon={AlertTriangle} label="Retards" value={money(d.kpis.retardTotal)} hint={`${d.kpis.nbRetardataires} familles`} tone="danger" />
        </div>
        <div className="grid g-2-1">
          <Card title="Évolution mensuelle des recettes" sub="Année en cours vs année précédente, et dépenses">
            <Combo data={d.mensuel} x="mois" fmt={k$} bars={[{ key: 'annee', name: 'Recettes', color: 'var(--c1)' }, { key: 'depenses', name: 'Dépenses', color: 'var(--c2)' }]} lines={[{ key: 'precedente', name: 'Recettes N-1', color: 'var(--text-3)', dashed: true }]} />
          </Card>
          <Card title="Répartition par mode de paiement">
            <Donut data={d.parMode} nameKey="mode" valueKey="montant" center={<div><div className="strong" style={{ fontSize: 20 }}>{k$(d.kpis.encaisse)}</div><div className="small muted">TND</div></div>} />
            <Legend items={d.parMode.map((m, i) => [`${m.mode} (${m.nb})`, PALETTE[i]])} />
          </Card>
        </div>
        <div className="grid g-1-2 mt">
          <Card title="Prévision des recettes" sub="Mois à venir">
            <Lines area data={prev} x="mois" fmt={k$} series={[{ key: 'reel', name: 'Réel' }, { key: 'prevision', name: 'Prévision', color: 'var(--c3)', dashed: true }, { key: 'haute', name: 'Hypothèse haute', color: 'var(--c3)', dashed: true }]} />
            <Method>{d.methodePrevision}</Method>
          </Card>
          <DataTable rows={d.retardataires} searchable={false} pageSize={8}
            columns={[
              { key: 'eleve', label: 'Retards de paiement', render: r => <><div className="cell-main">{r.eleve}</div><div className="cell-sub">{r.classe}</div></> },
              { key: 'parent', label: 'Parent', render: r => <><div>{r.parent}</div><div className="cell-sub">{r.telephone}</div></> },
              { key: 'retard', label: 'En retard', num: true, render: r => <b style={{ color: 'var(--danger)' }}>{money(r.retard)}</b> },
              { key: 'reste', label: 'Reste annuel', num: true, render: r => money(r.reste) },
              { key: 'joursSansPaiement', label: 'Sans paiement', num: true, render: r => r.joursSansPaiement == null ? <Badge tone="danger">jamais</Badge> : `${r.joursSansPaiement} j` }
            ]} />
        </div>
      </>
    );
  }}</Wrap>;
}

/* ------------------------------ 3. Pédagogie ---------------------------- */
function Pedagogie({ refresh }) {
  const [t, setT] = useState(null);
  const q = useFetch(`/bi/pedagogie${t ? `?trimestre=${t}` : ''}${refresh ? `${t ? '&' : '?'}refresh=1` : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="small muted">Période analysée : trimestre {d.trimestre}</span>
        <Seg value={t || d.trimestre} onChange={setT} options={[1, 2, 3].map(x => ({ value: x, label: `T${x}` }))} />
      </div>
      <div className="kpis">
        <Kpi icon={GraduationCap} label="Moyenne générale" value={note(d.kpis.moyenneGenerale)} hint={`${d.kpis.elevesEvalues} élèves évalués`} />
        <Kpi icon={ThumbsUp} label="Taux de réussite" value={pct(d.kpis.tauxReussite)} hint="Moyenne ≥ 10" tone="success" />
        <Kpi icon={ThumbsDown} label="Taux d'échec" value={pct(d.kpis.tauxEchec)} tone="danger" />
        <Kpi icon={AlertTriangle} label="À accompagner" value={d.kpis.aAccompagner} hint={`dont ${d.kpis.enDifficulte} sous 10`} tone="warning" />
        <Kpi icon={TrendingUp} label="Matière la plus réussie" value={<span style={{ fontSize: 18 }}>{d.kpis.meilleureMatiere}</span>} hint={`À renforcer : ${d.kpis.matiereFaible}`} tone="info" />
      </div>
      <div className="grid g2">
        <Card title="Classement des matières" sub="Moyenne de l'établissement par matière">
          <Bars horizontal height={300} data={d.parMatiere} x="matiere" series={[{ key: 'moyenne', name: 'Moyenne' }]} refLine={10} colorBy={x => x.moyenne < 10 ? 'var(--danger)' : x.moyenne < 11 ? 'var(--c2)' : 'var(--c1)'} />
        </Card>
        <Card title="Évolution entre les trimestres" sub="Moyenne générale : année en cours vs précédente">
          <Lines data={d.evolution} x="trimestre" fmt={v => num(v, 1)} series={[{ key: 'annee', name: 'Année en cours' }, { key: 'precedente', name: 'Année précédente', color: 'var(--text-3)', dashed: true }]} />
        </Card>
      </div>
      <div className="grid g3 mt">
        <Card title="Moyenne et réussite par classe" className="span2">
          <Combo data={d.parClasse} x="classe" bars={[{ key: 'reussite', name: 'Réussite (%)', color: 'var(--c5)' }]} lines={[{ key: 'moyenne', name: 'Moyenne', color: 'var(--c4)' }]} />
        </Card>
        <Card title="Distribution des moyennes">
          <Bars data={d.distribution} x="tranche" series={[{ key: 'eleves', name: 'Élèves' }]} colorBy={x => parseFloat(x.tranche) < 10 ? 'var(--danger)' : 'var(--c1)'} />
        </Card>
      </div>
      <h3 className="mt-lg" style={{ marginBottom: 10 }}>Élèves nécessitant un accompagnement pédagogique</h3>
      <DataTable rows={d.difficulte} pageSize={10}
        columns={[
          { key: 'eleve', label: 'Élève', render: r => <><div className="cell-main">{r.eleve}</div><div className="cell-sub">{r.classe}</div></> },
          { key: 'moyenne', label: 'Moyenne', num: true, render: r => <Badge tone={moyenneTone(r.moyenne)}>{note(r.moyenne)}</Badge> },
          { key: 'evolution', label: 'Évolution', num: true, render: r => r.evolution == null ? '—' : <span className={`delta ${r.evolution < 0 ? 'down' : 'up'}`}>{r.evolution > 0 ? '+' : ''}{num(r.evolution, 2)}</span> },
          { key: 'matieresFaibles', label: 'Matières sous 10', sort: r => r.matieresFaibles.length, render: r => <span className="small">{r.matieresFaibles.join(', ') || '—'}</span> },
          { key: 'raisons', label: 'Motifs', sort: false, render: r => <div className="row" style={{ gap: 4 }}>{r.raisons.map(x => <Badge key={x} tone="warning">{x}</Badge>)}</div> }
        ]} />
    </>
  )}</Wrap>;
}

/* ------------------------------ 4. Absences ----------------------------- */
function Absences({ refresh }) {
  const q = useFetch(`/bi/absences${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={Percent} label="Taux d'absentéisme" value={pct(d.kpis.tauxAbsenteisme)} hint={`sur ${d.kpis.joursEcoules} jours de classe`} />
        <Kpi icon={CalendarX} label="Absences" value={d.kpis.absences} hint={`${d.kpis.justifiees} justifiées · ${d.kpis.nonJustifiees} non justifiées`} />
        <Kpi icon={Clock} label="Retards" value={d.kpis.retards} tone="info" />
        <Kpi icon={Mail} label="Justifications à valider" value={d.kpis.enAttente} tone="warning" />
        <Kpi icon={AlertTriangle} label="Absences répétitives" value={d.kpis.repetitives} hint="≥ 3 en 30 j ou ≥ 6 dans l'année" tone="danger" />
      </div>
      <div className="grid g2">
        <Card title="Évolution mensuelle" sub="Absences et retards, comparaison avec l'année précédente">
          <Combo data={d.mensuel} x="mois" bars={[{ key: 'absences', name: 'Absences', color: 'var(--c4)' }, { key: 'retards', name: 'Retards', color: 'var(--c2)' }]} lines={[{ key: 'precedente', name: 'Absences N-1', color: 'var(--text-3)', dashed: true }]} />
        </Card>
        <Card title="Taux d'absentéisme par classe">
          <Bars horizontal height={280} data={d.parClasse} x="classe" fmt={v => `${v}%`} series={[{ key: 'taux', name: 'Taux (%)' }]} colorBy={x => x.taux > 6 ? 'var(--danger)' : x.taux > 4 ? 'var(--c2)' : 'var(--c1)'} />
        </Card>
      </div>
      <div className="grid g-1-2 mt">
        <Card title="Justifiées / non justifiées">
          <Donut data={[{ name: 'Justifiées', value: d.kpis.justifiees }, { name: 'Non justifiées', value: d.kpis.nonJustifiees }]} colors={['var(--c1)', 'var(--c4)']} center={<div className="strong" style={{ fontSize: 20 }}>{d.kpis.absences}</div>} />
          <Legend items={[['Justifiées', 'var(--c1)'], ['Non justifiées', 'var(--c4)']]} />
        </Card>
        <Card title="Relation absentéisme / résultats" sub={`Coefficient de corrélation de Pearson : r = ${num(d.correlation.r, 2)}`}>
          <Scatterplot data={d.correlation.points} x="taux" y="moyenne" xName="Taux d'absence" yName="Moyenne" />
          <Alert tone={d.correlation.r <= -0.25 ? 'warning' : 'info'}>{d.correlation.interpretation}</Alert>
        </Card>
      </div>
      <h3 className="mt-lg" style={{ marginBottom: 10 }}>Élèves ayant des absences répétitives</h3>
      <DataTable rows={d.repetitives} pageSize={10} columns={[
        { key: 'eleve', label: 'Élève', render: r => <><div className="cell-main">{r.eleve}</div><div className="cell-sub">{r.classe}</div></> },
        { key: 'absences', label: 'Absences', num: true },
        { key: 'recentes', label: '30 derniers jours', num: true },
        { key: 'nonJustifiees', label: 'Non justifiées', num: true },
        { key: 'retards', label: 'Retards', num: true },
        { key: 'taux', label: 'Taux', num: true, render: r => <Badge tone="danger">{pct(r.taux)}</Badge> }
      ]} />
    </>
  )}</Wrap>;
}

/* ------------------------------ 5. Enseignants -------------------------- */
function Enseignants({ refresh }) {
  const q = useFetch(`/bi/enseignants${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={Users} label="Enseignants" value={d.kpis.enseignants} />
        <Kpi icon={Clock} label="Heures hebdomadaires" value={num(d.kpis.heuresTotales, 1)} unit="h" hint={`${num(d.kpis.chargeMoyenne, 1)} h en moyenne`} />
        <Kpi icon={AlertTriangle} label="En surcharge" value={d.kpis.surcharge} tone="danger" />
        <Kpi icon={TrendingUp} label="En sous-charge" value={d.kpis.sousCharge} tone="warning" />
        <Kpi icon={CalendarX} label="Absences (année)" value={d.kpis.absences} hint={`${pct(d.kpis.tauxRemplacement)} remplacées`} tone="info" />
      </div>
      <div className="grid g-2-1">
        <Card title="Charge horaire par enseignant" sub="Heures planifiées / maximum contractuel">
          <Bars horizontal height={Math.max(260, d.charge.length * 26)} data={d.charge} x="nom" series={[{ key: 'heures', name: 'Heures' }, { key: 'max', name: 'Maximum', color: 'var(--border-strong)' }]} />
        </Card>
        <div className="stack">
          <Card title="Répartition des heures par matière"><Donut data={d.parMatiere} nameKey="matiere" valueKey="heures" /><Legend items={d.parMatiere.map((m, i) => [m.matiere, PALETTE[i % PALETTE.length]])} /></Card>
          <Card title="Absences et remplacements"><Bars height={200} data={d.mensuelAbs} x="mois" series={[{ key: 'absences', name: 'Absences', color: 'var(--c4)' }, { key: 'remplacees', name: 'Remplacées', color: 'var(--c1)' }]} /></Card>
        </div>
      </div>
      <h3 className="mt-lg" style={{ marginBottom: 10 }}>Détail par enseignant</h3>
      <DataTable rows={d.charge} columns={[
        { key: 'nom', label: 'Enseignant', render: r => <><div className="cell-main">{r.nom}</div><div className="cell-sub">{r.specialite}</div></> },
        { key: 'matieres', label: 'Matières', sort: false, render: r => <span className="small">{r.matieres.join(', ')}</span> },
        { key: 'classes', label: 'Classes', num: true },
        { key: 'heures', label: 'Charge', render: r => <div style={{ minWidth: 140 }}><div className="small"><b>{num(r.heures, 1)} h</b> / {r.max} h</div><Meter value={r.heures} max={r.max} tone={r.statut === 'surcharge' ? 'danger' : r.statut === 'sous-charge' ? 'warning' : ''} /></div> },
        { key: 'absences', label: 'Absences', num: true, render: r => `${r.absences} (${r.remplacees} remplacées)` },
        { key: 'statut', label: 'Statut', render: r => <Badge tone={r.statut === 'surcharge' ? 'danger' : r.statut === 'sous-charge' ? 'warning' : 'success'} dot>{r.statut}</Badge> }
      ]} />
    </>
  )}</Wrap>;
}

/* ---------------------------- 6. Inscriptions --------------------------- */
function Inscriptions({ refresh }) {
  const q = useFetch(`/bi/inscriptions${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={UserPlus} label="Nouvelles inscriptions" value={d.kpis.nouvelles} />
        <Kpi icon={RefreshCw} label="Réinscriptions" value={d.kpis.reinscriptions} tone="info" />
        <Kpi icon={Percent} label="Taux de renouvellement" value={pct(d.kpis.tauxRenouvellement)} tone="success" />
        <Kpi icon={TrendingUp} label="Départs / abandons" value={`${d.kpis.departs} / ${d.kpis.abandons}`} hint="sur 2 années" tone="danger" />
        <Kpi icon={Target} label={`Prévision ${d.prevision.annee}`} value={d.kpis.previsionN1} unit=" élèves" hint={`${d.kpis.preinscriptionsEnAttente} pré-inscriptions en attente`} tone="warning" />
      </div>
      <div className="grid g-2-1">
        <Card title="Historique des effectifs" sub="Nouveaux élèves, départs et abandons par année">
          <Combo data={d.historique} x="annee" bars={[{ key: 'nouveaux', name: 'Nouveaux', color: 'var(--c1)' }, { key: 'departs', name: 'Départs', color: 'var(--c2)' }, { key: 'abandons', name: 'Abandons', color: 'var(--c4)' }]} lines={[{ key: 'effectif', name: 'Effectif', color: 'var(--c3)' }]} />
        </Card>
        <Card title="Origine géographique">
          <Donut data={d.villes} nameKey="ville" valueKey="eleves" />
          <Legend items={d.villes.map((v, i) => [`${v.ville} (${v.eleves})`, PALETTE[i % PALETTE.length]])} />
        </Card>
      </div>
      <div className="grid g2 mt">
        <Card title={`Prévision des effectifs ${d.prevision.annee}`}>
          <div className="grid g3">
            <Kpi label="Réinscriptions attendues" value={d.prevision.reinscritsPrevus} />
            <Kpi label="Nouveaux attendus" value={d.prevision.nouveauxPrevus} />
            <Kpi label="Total prévu" value={d.prevision.total} tone="info" />
          </div>
          <Method>{d.prevision.methode}</Method>
        </Card>
        <Card title="Motifs de départ">
          {d.motifs.length ? <Bars horizontal height={220} data={d.motifs} x="motif" series={[{ key: 'nb', name: 'Élèves', color: 'var(--c2)' }]} /> : <Empty />}
        </Card>
      </div>
    </>
  )}</Wrap>;
}

/* --------------------------- 7. Communication --------------------------- */
function Communication({ refresh }) {
  const q = useFetch(`/bi/communication${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={Mail} label="Messages envoyés aux parents" value={num(d.kpis.messagesEnvoyes)} hint={`dont ${d.kpis.messagesAuto} automatiques`} />
        <Kpi icon={Percent} label="Taux de lecture (messages)" value={pct(d.kpis.tauxLectureMessages)} tone="success" />
        <Kpi icon={Percent} label="Lecture des notifications" value={pct(d.kpis.tauxLectureNotifications)} tone="info" />
        <Kpi icon={ThumbsDown} label="Parents ne consultant pas" value={d.kpis.parentsNonLecteurs} hint={`${d.kpis.parentsInactifs} inactifs > 30 j sur ${d.kpis.parents}`} tone="warning" />
        <Kpi icon={AlertTriangle} label="Réclamations ouvertes" value={d.kpis.reclamationsOuvertes} hint={`${d.kpis.reclamations} réclamations et demandes`} tone="danger" />
      </div>
      <div className="grid g-2-1">
        <Card title="Volume des échanges" sub="Messages envoyés aux parents et reçus des parents">
          <Bars data={d.mensuel} x="mois" series={[{ key: 'envoyes', name: 'Envoyés aux parents' }, { key: 'recus', name: 'Reçus des parents', color: 'var(--c2)' }]} />
        </Card>
        <Card title="Suivi des réclamations et demandes">
          <Donut data={[{ name: 'Traitées', value: d.reclamations.traitees }, { name: 'En cours', value: d.reclamations.ouvertes }]} colors={['var(--c1)', 'var(--c4)']} center={<div className="strong" style={{ fontSize: 20 }}>{d.kpis.reclamations}</div>} />
          <Legend items={[['Traitées', 'var(--c1)'], ['En cours', 'var(--c4)']]} />
        </Card>
      </div>
      <div className="grid g2 mt">
        <div>
          <h3 style={{ marginBottom: 10 }}>Parents qui ne consultent pas les messages</h3>
          <DataTable rows={d.nonLecteurs} pageSize={8} searchable={false} columns={[
            { key: 'parent', label: 'Parent', render: r => <span className="cell-main">{r.parent}</span> },
            { key: 'nonLus', label: 'Non lus', num: true, render: r => <Badge tone="warning">{r.nonLus} / {r.recus}</Badge> },
            { key: 'derniereConnexion', label: 'Dernière connexion', render: r => relative(r.derniereConnexion), sort: r => r.derniereConnexion || '' }
          ]} />
        </div>
        <div>
          <h3 style={{ marginBottom: 10 }}>Situations nécessitant un renforcement du suivi parental</h3>
          <DataTable rows={d.suivi} pageSize={8} searchable={false} empty={<Empty title="Aucune situation critique" />} columns={[
            { key: 'eleve', label: 'Élève / parent', render: r => <><div className="cell-main">{r.eleve}</div><div className="cell-sub">{r.parent}</div></> },
            { key: 'moyenne', label: 'Moyenne', num: true, render: r => <Badge tone={moyenneTone(r.moyenne)}>{note(r.moyenne)}</Badge> },
            { key: 'absences', label: 'Absences', num: true },
            { key: 'messagesNonLus', label: 'Msg non lus', num: true }
          ]} />
        </div>
      </div>
    </>
  )}</Wrap>;
}

/* ----------------------------- 8. Ressources ---------------------------- */
function Ressources({ refresh }) {
  const q = useFetch(`/bi/ressources${refresh ? '?refresh=1' : ''}`);
  return <Wrap q={q}>{d => (
    <>
      <div className="kpis">
        <Kpi icon={DoorOpen} label="Salles" value={d.kpis.salles} />
        <Kpi icon={Percent} label="Occupation moyenne" value={pct(d.kpis.occupationMoyenne)} tone="info" />
        <Kpi icon={TrendingUp} label="Salles sous-utilisées" value={d.kpis.sousUtilisees} hint="< 40 % d'occupation" tone="warning" />
        <Kpi icon={AlertTriangle} label="Conflits d'horaires" value={d.kpis.conflits} tone={d.kpis.conflits ? 'danger' : 'success'} hint={d.kpis.conflits ? 'À corriger' : 'Aucun conflit détecté'} />
        <Kpi icon={Clock} label="Classes déséquilibrées" value={d.kpis.classesDesequilibrees} hint={`${d.kpis.creneaux} créneaux planifiés`} />
      </div>
      <div className="grid g2">
        <Card title="Taux d'occupation des salles" sub="Heures planifiées / 30 h disponibles par semaine">
          <Bars horizontal height={Math.max(260, d.salles.length * 26)} data={d.salles} x="salle" fmt={v => `${v}%`} series={[{ key: 'taux', name: 'Occupation (%)' }]} colorBy={x => x.statut === 'sous-utilisée' ? 'var(--c2)' : x.statut === 'saturée' ? 'var(--c4)' : 'var(--c1)'} />
        </Card>
        <div className="stack">
          <Card title="Répartition des heures par jour"><Bars height={200} data={d.parJour} x="jour" series={[{ key: 'heures', name: 'Heures' }]} /></Card>
          <Card title="Conflits d'horaires">
            {d.conflits.length ? <div className="list">{d.conflits.map((c, i) => <div className="list-item" key={i}><Badge tone="danger">{c.type}</Badge><span className="small">{c.jour} {c.horaire} – {c.details}</span></div>)}</div>
              : <Alert tone="success">Aucun conflit : la détection automatique empêche la double affectation d'un enseignant, d'une salle ou d'une classe.</Alert>}
          </Card>
        </div>
      </div>
      <h3 className="mt-lg" style={{ marginBottom: 10 }}>Équilibre des emplois du temps par classe</h3>
      <DataTable rows={d.equilibre} searchable={false} columns={[
        { key: 'classe', label: 'Classe', render: r => <span className="cell-main">{r.classe}</span> },
        { key: 'total', label: 'Heures / semaine', num: true },
        { key: 'max', label: 'Journée la plus chargée', num: true, render: r => `${r.max} h` },
        { key: 'min', label: 'Journée la plus légère', num: true, render: r => `${r.min} h` },
        { key: 'ecartType', label: 'Écart-type', num: true },
        { key: 'statut', label: 'Équilibre', render: r => <Badge tone={r.statut === 'équilibré' ? 'success' : 'warning'} dot>{r.statut}</Badge> }
      ]} />
    </>
  )}</Wrap>;
}

/* ------------------------------ 9. Risques ------------------------------ */
function Risques({ refresh }) {
  const q = useFetch(`/bi/risques${refresh ? '?refresh=1' : ''}`);
  const [filtre, setFiltre] = useState('tous');
  return <Wrap q={q}>{d => {
    const rows = filtre === 'tous' ? d.eleves : filtre === 'cumul' ? d.cumul : d.eleves.filter(e => (filtre === 'echec' ? e.risqueEchec : filtre === 'abandon' ? e.risqueAbandon : e.risqueImpaye) >= 50);
    return (
      <>
        <div className="kpis">
          <Kpi icon={Siren} label="Risque élevé" value={d.kpis.risqueEleve} hint={`${d.kpis.risqueModere} en risque modéré`} tone="danger" />
          <Kpi icon={GraduationCap} label="Risque d'échec" value={d.kpis.echec} tone="warning" />
          <Kpi icon={UserPlus} label="Risque d'abandon" value={d.kpis.abandon} tone="warning" />
          <Kpi icon={Wallet} label="Risque d'impayé" value={d.kpis.impaye} hint={`${money(d.kpis.montantARisque)} en retard`} tone="info" />
          <Kpi icon={AlertTriangle} label="Absences + baisse des résultats" value={d.kpis.cumul} tone="danger" />
        </div>
        <div className="grid g-1-2">
          <Card title="Répartition des élèves par niveau de risque">
            <Donut data={d.distribution} nameKey="niveau" valueKey="eleves" colors={['var(--c1)', 'var(--c2)', 'var(--c4)']} />
            <Legend items={d.distribution.map((x, i) => [`${x.niveau} (${x.eleves})`, ['var(--c1)', 'var(--c2)', 'var(--c4)'][i]])} />
            <Method>{d.methode}</Method>
          </Card>
          <Card title="Alertes pour une intervention précoce" sub="Actions recommandées automatiquement">
            {d.alertes.length ? <div className="list">{d.alertes.map((a, i) => (
              <div className="list-item" key={i}>
                <div className="ico" style={{ background: a.gravite === 'critique' ? 'var(--danger-soft)' : 'var(--warning-soft)', color: a.gravite === 'critique' ? 'var(--danger)' : 'var(--warning)' }}><Siren size={16} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row between"><b className="small">{a.eleve} <span className="muted">· {a.classe}</span></b><Badge tone={a.gravite === 'critique' ? 'danger' : 'warning'}>{a.gravite}</Badge></div>
                  <div className="small muted">{a.message}</div>
                  <div className="small" style={{ color: 'var(--accent-text)', fontWeight: 700, marginTop: 2 }}>→ {a.action}</div>
                </div>
              </div>
            ))}</div> : <Empty title="Aucune alerte" />}
          </Card>
        </div>
        <div className="row between mt-lg" style={{ marginBottom: 10 }}>
          <h3>Élèves à surveiller</h3>
          <Seg value={filtre} onChange={setFiltre} options={[{ value: 'tous', label: 'Tous' }, { value: 'echec', label: 'Échec' }, { value: 'abandon', label: 'Abandon' }, { value: 'impaye', label: 'Impayé' }, { value: 'cumul', label: 'Absences + baisse' }]} />
        </div>
        <DataTable rows={rows} pageSize={12} initialSort={{ key: 'score', dir: 'desc' }} columns={[
          { key: 'eleve', label: 'Élève', render: r => <><div className="cell-main">{r.eleve}</div><div className="cell-sub">{r.classe}</div></> },
          { key: 'score', label: 'Score', num: true, render: r => <Badge tone={r.niveau === 'élevé' ? 'danger' : 'warning'}>{r.score}/100</Badge> },
          { key: 'risqueEchec', label: 'Échec', num: true, render: r => <ScoreBar v={r.risqueEchec} /> },
          { key: 'risqueAbandon', label: 'Abandon', num: true, render: r => <ScoreBar v={r.risqueAbandon} /> },
          { key: 'risqueImpaye', label: 'Impayé', num: true, render: r => <ScoreBar v={r.risqueImpaye} /> },
          { key: 'signaux', label: 'Signaux détectés', sort: false, render: r => <div className="row" style={{ gap: 4 }}>{r.signaux.map(s => <Badge key={s}>{s}</Badge>)}</div> }
        ]} />
      </>
    );
  }}</Wrap>;
}
const ScoreBar = ({ v }) => <div style={{ width: 80, marginLeft: 'auto' }}><div className="small strong right">{v}</div><Meter value={v} tone={v >= 60 ? 'danger' : v >= 35 ? 'warning' : ''} /></div>;

/* ------------------------------ 10. Stratégie --------------------------- */
function Strategie() {
  const [p, setP] = useState({ croissance: 0, recouvrement: '', capacite: 25, hausseFrais: 0 });
  const [applied, setApplied] = useState(p);
  useEffect(() => { const t = setTimeout(() => setApplied(p), 350); return () => clearTimeout(t); }, [p]);
  const qs = new URLSearchParams(Object.entries(applied).filter(([, v]) => v !== '' && v != null)).toString();
  const q = useFetch(`/bi/strategie?${qs}`);
  const slider = (key, label, min, max, step, unit) => (
    <div className="field">
      <label className="row between"><span>{label}</span><b style={{ color: 'var(--text)' }}>{p[key] === '' ? 'auto' : `${p[key] > 0 && unit === '%' && key !== 'recouvrement' ? '+' : ''}${p[key]}${unit}`}</b></label>
      <input className="range" type="range" min={min} max={max} step={step} value={p[key] === '' ? (key === 'recouvrement' ? 92 : 0) : p[key]} onChange={e => setP({ ...p, [key]: +e.target.value })} />
    </div>
  );
  return (
    <>
      <div className="grid g-1-2">
        <Card title="Simulateur de scénarios" sub="Ajustez les hypothèses : les projections se recalculent">
          <div className="stack">
            {slider('croissance', 'Variation des effectifs', -20, 30, 1, '%')}
            {slider('recouvrement', 'Taux de recouvrement visé', 70, 100, 1, '%')}
            {slider('hausseFrais', 'Évolution des frais de scolarité', -10, 20, 1, '%')}
            {slider('capacite', 'Élèves par classe', 18, 32, 1, '')}
            <button className="btn sm ghost" onClick={() => setP({ croissance: 0, recouvrement: '', capacite: 25, hausseFrais: 0 })}>Réinitialiser</button>
          </div>
        </Card>
        <Wrap q={q}>{d => (
          <Card title={`Projection ${d.prevision.annee}`} sub={`Hypothèses : frais moyen ${money(d.hypotheses.fraisMoyen)}, recouvrement ${pct(d.hypotheses.tauxRecouvrement)}`}>
            <div className="grid g4" style={{ marginBottom: 12 }}>
              <Kpi label="Élèves prévus" value={d.prevision.effectif} />
              <Kpi label="Recettes prévues" value={money(d.prevision.recettes)} tone="success" />
              <Kpi label="Dépenses prévues" value={money(d.prevision.depenses)} tone="warning" />
              <Kpi label="Résultat" value={money(d.prevision.resultat)} tone={d.prevision.resultat < 0 ? 'danger' : 'success'} />
            </div>
            <div className="grid g3">
              <Kpi label="Classes nécessaires" value={d.prevision.classesNecessaires} />
              <Kpi label="Enseignants à recruter" value={d.prevision.enseignantsSupplementaires} tone={d.prevision.enseignantsSupplementaires ? 'warning' : ''} />
              <Kpi label="Salles nécessaires" value={d.prevision.sallesNecessaires} />
            </div>
          </Card>
        )}</Wrap>
      </div>
      <Wrap q={q}>{d => (
        <>
          <div className="grid g2 mt">
            <Card title="Comparaison des scénarios" sub="Recettes, dépenses et résultat prévisionnels">
              <Bars data={d.scenarios} x="scenario" fmt={k$} series={[{ key: 'recettes', name: 'Recettes', color: 'var(--c1)' }, { key: 'depenses', name: 'Dépenses', color: 'var(--c2)' }, { key: 'resultat', name: 'Résultat', color: 'var(--c3)' }]} />
              <table className="data mt"><thead><tr><th>Scénario</th><th className="num">Élèves</th><th className="num">Classes</th><th className="num">Enseignants</th><th className="num">Salles</th></tr></thead>
                <tbody>{d.scenarios.map(s => <tr key={s.scenario}><td className="cell-main">{s.scenario}</td><td className="num">{s.effectif}</td><td className="num">{s.classes}</td><td className="num">{s.enseignants}</td><td className="num">{s.salles}</td></tr>)}</tbody></table>
            </Card>
            <Card title="Comparaison pluriannuelle">
              <table className="data">
                <thead><tr><th>Indicateur</th>{d.comparaison.map(c => <th key={c.annee} className="num">{c.annee}</th>)}<th className="num">Évolution</th></tr></thead>
                <tbody>{[['Effectif', 'effectif', num], ['Moyenne des notes', 'moyenne', note], ['Recettes', 'recettes', money], ['Dépenses', 'depenses', money], ['Absences par élève', 'absencesParEleve', v => num(v, 1)]].map(([l, k, f]) => {
                  const [a, b] = d.comparaison.map(c => c[k]);
                  const ev = a ? ((b - a) / a) * 100 : null;
                  const good = k === 'absencesParEleve' || k === 'depenses' ? ev < 0 : ev > 0;
                  return <tr key={k}><td className="cell-main">{l}</td>{d.comparaison.map(c => <td key={c.annee} className="num">{f(c[k])}</td>)}<td className="num">{ev == null ? '—' : <span className={`delta ${good ? 'up' : 'down'}`}>{ev > 0 ? '+' : ''}{num(ev, 1)} %</span>}</td></tr>;
                })}</tbody>
              </table>
              <Method>L'année en cours est partielle : recettes, dépenses et absences ne couvrent que les mois écoulés.</Method>
            </Card>
          </div>
          <Card className="mt" title="Recommandations automatiques" sub="Générées par le moteur de règles à partir de l'ensemble des tableaux de bord">
            {d.recommandations.map((r, i) => (
              <div className="reco" key={i}>
                <div className={`prio ${r.priorite}`} />
                <div style={{ flex: 1 }}>
                  <div className="row"><Badge tone={r.priorite === 'haute' ? 'danger' : r.priorite === 'moyenne' ? 'warning' : 'info'}>Priorité {r.priorite}</Badge><span className="small strong muted">{r.domaine}</span></div>
                  <p style={{ marginTop: 4 }}>{r.texte}</p>
                </div>
              </div>
            ))}
          </Card>
        </>
      )}</Wrap>
    </>
  );
}
