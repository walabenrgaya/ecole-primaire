import React, { useMemo, useState } from 'react';
import { PenSquare, Inbox, Send, FileEdit, EyeOff, Lock, Paperclip, CheckCheck, Check, Trash2 } from 'lucide-react';
import { useApp, useFetch, PageHead, Tabs, Badge, Modal, Field, ErrorBox, Empty, Loading } from '../ui/core.jsx';
import { FileInput } from '../ui/Crud.jsx';
import { get, post, put, del } from '../lib/api.js';
import { ROLE_LABEL, dateTime, relative, initials } from '../lib/format.js';

const CATEGORIES = { information: 'Information', pedagogique: 'Pédagogique', administratif: 'Administratif', paiement: 'Paiement', reclamation: 'Réclamation', demande: 'Demande', rappel: 'Rappel' };
const CAT_TONE = { paiement: 'success', reclamation: 'danger', demande: 'warning', rappel: 'warning', pedagogique: 'info' };

export default function Messages() {
  const { user, toast, confirm } = useApp();
  const box = useFetch('/messages');
  const [dossier, setDossier] = useState('inbox');
  const [sel, setSel] = useState(null);
  const [compose, setCompose] = useState(null);

  const liste = box.data?.[dossier] || [];
  const nonLus = (box.data?.inbox || []).filter(m => !m.lu).length;

  const ouvrir = async m => {
    if (m.brouillon) return setCompose(m);
    setSel(m);
    if (dossier === 'inbox' && !m.lu) { await get(`/messages/${m.id}`).catch(() => {}); box.reload(); }
    else get(`/messages/${m.id}`).catch(() => {}); // journalise la consultation de l'historique
  };
  const masquer = async m => {
    if (!(await confirm({ title: 'Masquer ce message', message: 'Le message disparaîtra de votre boîte de réception. La copie de l\'expéditeur et l\'historique sont conservés.', confirmLabel: 'Masquer' }))) return;
    await post(`/messages/${m.id}/masquer`); setSel(null); box.reload(); toast('Message masqué');
  };
  const traiter = async m => { await post(`/messages/${m.id}/traiter`); toast('Demande marquée comme traitée'); box.reload(); setSel({ ...m, traite: true }); };

  return (
    <>
      <PageHead eyebrow="Communication" title="Messagerie" subtitle="Les messages envoyés sont immuables (ni modifiables, ni supprimables) pour garantir la traçabilité des échanges."
        actions={<button className="btn primary" onClick={() => setCompose({})}><PenSquare size={16} />Nouveau message</button>} />
      <Tabs value={dossier} onChange={d => { setDossier(d); setSel(null); }} tabs={[
        { id: 'inbox', label: 'Réception', icon: Inbox, count: nonLus || undefined },
        { id: 'sent', label: 'Envoyés', icon: Send },
        { id: 'drafts', label: 'Brouillons', icon: FileEdit, count: box.data?.drafts.length || undefined }
      ]} />
      <div className="card mail">
        <div className="mail-list">
          {box.loading && <Loading />}
          {!box.loading && !liste.length && <Empty title="Aucun message" />}
          {liste.map(m => {
            const autre = dossier === 'inbox' ? `${m.de_nom}` : m.a_nom;
            return (
              <div key={m.id} className={`mail-item ${sel?.id === m.id ? 'active' : ''} ${dossier === 'inbox' && !m.lu ? 'unread' : ''}`} onClick={() => ouvrir(m)}>
                <div className="top"><b className="nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dossier === 'inbox' && !m.lu && <span style={{ color: 'var(--accent)' }}>● </span>}{autre}</b><span className="muted nowrap">{relative(m.created_at)}</span></div>
                <div className="subj">{m.objet || '(sans objet)'}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>{m.categorie !== 'information' && <Badge tone={CAT_TONE[m.categorie]}>{CATEGORIES[m.categorie]}</Badge>}{m.auto && <Badge>Automatique</Badge>}<span className="prev" style={{ flex: 1 }}>{m.corps}</span></div>
              </div>
            );
          })}
        </div>
        <div className="mail-view">
          {!sel ? <Empty title="Sélectionnez un message" text="Le contenu s'affichera ici." /> : (
            <>
              <div className="row between">
                <div className="row">{sel.categorie && <Badge tone={CAT_TONE[sel.categorie]}>{CATEGORIES[sel.categorie]}</Badge>}{sel.eleve_nom && <Badge>Élève : {sel.eleve_nom}</Badge>}</div>
                <div className="row">
                  {dossier === 'inbox' && ['reclamation', 'demande'].includes(sel.categorie) && user.role !== 'parent' && (sel.traite ? <Badge tone="success">Traitée</Badge> : <button className="btn sm" onClick={() => traiter(sel)}><CheckCheck size={14} />Marquer traitée</button>)}
                  {dossier === 'inbox' && <button className="btn sm ghost" onClick={() => masquer(sel)}><EyeOff size={14} />Masquer</button>}
                  {dossier === 'inbox' && <button className="btn sm" onClick={() => setCompose({ a_id: sel.de_id, objet: sel.objet?.startsWith('Re:') ? sel.objet : `Re: ${sel.objet}`, eleve_id: sel.eleve_id, categorie: sel.categorie === 'paiement' || sel.categorie === 'rappel' ? 'administratif' : sel.categorie })}>Répondre</button>}
                </div>
              </div>
              <h2 className="mt">{sel.objet}</h2>
              <div className="row mt">
                <span className="avatar">{initials(sel.de_nom)}</span>
                <div className="small"><b>{sel.de_nom}</b> <span className="muted">({ROLE_LABEL[sel.de_role]})</span> → <b>{sel.a_nom}</b> <span className="muted">({ROLE_LABEL[sel.a_role]})</span><div className="muted">{dateTime(sel.created_at)}</div></div>
              </div>
              <div className="mail-body">{linkify(sel.corps)}</div>
              {sel.piece_jointe && <a className="btn sm mt" href={sel.piece_jointe} target="_blank" rel="noreferrer"><Paperclip size={14} />Pièce jointe</a>}
              <div className="row mt-lg small muted"><Lock size={13} />Message archivé et non modifiable.
                {dossier === 'sent' && (sel.lu ? <><Check size={13} color="var(--success)" />Lu {sel.lu_at && relative(sel.lu_at)}</> : ' Non lu par le destinataire.')}</div>
            </>
          )}
        </div>
      </div>
      {compose && <Compose initial={compose} onClose={() => setCompose(null)} onDone={() => { setCompose(null); box.reload(); }} />}
    </>
  );
}

function linkify(text = '') {
  return text.split(/(https?:\/\/\S+|\/recu\/\d+)/g).map((p, i) => /^(https?:\/\/|\/recu\/)/.test(p) ? <a key={i} href={p.startsWith('http') && p.includes('/recu/') ? new URL(p).pathname : p}>{p}</a> : p);
}

function Compose({ initial, onClose, onDone }) {
  const { user, toast, confirm } = useApp();
  const dest = useFetch('/messages/destinataires');
  const eleves = useFetch(['parent', 'eleve'].includes(user.role) ? null : '/eleves?statut=inscrit');
  const [f, setF] = useState({ a_id: '', categorie: 'information', objet: '', corps: '', eleve_id: '', piece_jointe: '', ...initial });
  const [error, setError] = useState(null);
  const groupes = useMemo(() => {
    const g = {};
    (dest.data || []).forEach(d => (g[d.role] ||= []).push(d));
    return g;
  }, [dest.data]);
  const enfants = user.role === 'parent' ? user.enfants || [] : eleves.data || [];

  const envoyer = async brouillon => {
    setError(null);
    const body = { ...f, a_id: +f.a_id, eleve_id: f.eleve_id ? +f.eleve_id : null, brouillon };
    try {
      if (initial.id) await put(`/messages/${initial.id}`, body); else await post('/messages', body);
      toast(brouillon ? 'Brouillon enregistré' : 'Message envoyé – le destinataire est notifié');
      onDone();
    } catch (e) { setError(e); }
  };
  const supprimer = async () => {
    if (!(await confirm({ title: 'Supprimer le brouillon', message: 'Ce brouillon sera définitivement supprimé.', danger: true, confirmLabel: 'Supprimer' }))) return;
    await del(`/messages/${initial.id}`); toast('Brouillon supprimé'); onDone();
  };
  const cats = ['information', 'pedagogique', 'administratif', 'demande', 'reclamation', 'rappel'].filter(c => user.role === 'parent' ? c !== 'rappel' : c !== 'reclamation');

  return (
    <Modal title={initial.id ? 'Modifier le brouillon' : 'Nouveau message'} onClose={onClose} size="wide"
      footer={<>
        {initial.id && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={supprimer}><Trash2 size={15} />Supprimer</button>}
        <button className="btn" onClick={() => envoyer(true)} disabled={!f.a_id}>Enregistrer en brouillon</button>
        <button className="btn primary" onClick={() => envoyer(false)} disabled={!f.a_id || !f.objet || !f.corps}><Send size={15} />Envoyer</button>
      </>}>
      <div className="stack">
        <ErrorBox error={error} />
        <div className="form-grid">
          <Field label="Destinataire" required help="Seuls les interlocuteurs autorisés pour votre profil sont proposés.">
            <select value={f.a_id} onChange={e => setF({ ...f, a_id: e.target.value })}>
              <option value="">Sélectionner…</option>
              {Object.entries(groupes).map(([role, ds]) => <optgroup key={role} label={ROLE_LABEL[role]}>{ds.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}</optgroup>)}
            </select>
          </Field>
          <Field label="Catégorie"><select value={f.categorie} onChange={e => setF({ ...f, categorie: e.target.value })}>{cats.map(c => <option key={c} value={c}>{CATEGORIES[c]}</option>)}</select></Field>
          {user.role !== 'eleve' && <Field label="Élève concerné" help="Rattache le message au fil de discussion de l'élève"><select value={f.eleve_id || ''} onChange={e => setF({ ...f, eleve_id: e.target.value })}><option value="">—</option>{enfants.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom}</option>)}</select></Field>}
          <Field label="Objet" required full><input value={f.objet} onChange={e => setF({ ...f, objet: e.target.value })} /></Field>
          <Field label="Message" required full><textarea style={{ minHeight: 160 }} value={f.corps} onChange={e => setF({ ...f, corps: e.target.value })} /></Field>
          <Field label="Pièce jointe" full><FileInput value={f.piece_jointe} onChange={url => setF({ ...f, piece_jointe: url })} /></Field>
        </div>
      </div>
    </Modal>
  );
}
