import React, { useState } from 'react';
import { Megaphone, Plus, Lock, CornerDownRight } from 'lucide-react';
import { useApp, useFetch, PageHead, Card, Badge, Modal, Field, ErrorBox, Empty, Loading, Alert } from '../ui/core.jsx';
import { post } from '../lib/api.js';
import { dateTime } from '../lib/format.js';

const CIBLES = { tous: 'Tout le monde', parents: 'Parents', enseignants: 'Enseignants', eleves: 'Élèves' };

export default function Annonces() {
  const { user, toast } = useApp();
  const list = useFetch('/annonces');
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const peutPublier = ['admin', 'directeur', 'superadmin'].includes(user.role);

  const publier = async e => {
    e.preventDefault();
    try { await post('/annonces', form); toast('Annonce publiée'); setForm(null); list.reload(); }
    catch (err) { setError(err); }
  };
  const byId = Object.fromEntries((list.data || []).map(a => [a.id, a]));

  return (
    <>
      <PageHead eyebrow="Communication" title="Annonces" subtitle="Une annonce publiée ne peut être ni modifiée ni supprimée. En cas d'erreur, publiez une annonce corrective."
        actions={peutPublier && <button className="btn primary" onClick={() => { setError(null); setForm({ titre: '', contenu: '', cible: 'tous', importante: false }); }}><Plus size={16} />Publier une annonce</button>} />
      {list.loading ? <Loading /> : !(list.data || []).length ? <Empty title="Aucune annonce" icon={Megaphone} /> : (
        <div className="stack" style={{ maxWidth: 860 }}>
          {list.data.map(a => (
            <Card key={a.id}>
              <div className="row between">
                <div className="row">{a.importante && <Badge tone="danger" dot>Important</Badge>}<Badge tone="accent">{CIBLES[a.cible]}</Badge>{a.corrige_annonce_id && <Badge tone="warning">Correctif</Badge>}</div>
                <span className="small muted">{dateTime(a.created_at)}</span>
              </div>
              <h3 style={{ fontSize: 17, marginTop: 10 }}>{a.titre}</h3>
              {a.corrige_annonce_id && byId[a.corrige_annonce_id] && <div className="small muted row" style={{ marginTop: 4 }}><CornerDownRight size={13} />Corrige : « {byId[a.corrige_annonce_id].titre} »</div>}
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text-2)' }}>{a.contenu}</p>
              <div className="row between mt small muted">
                <span>Publié par {a.auteur_nom}</span>
                <span className="row"><Lock size={12} />Immuable
                  {peutPublier && <button className="btn sm ghost" onClick={() => { setError(null); setForm({ titre: `Correctif : ${a.titre}`, contenu: '', cible: a.cible, importante: a.importante, corrige_annonce_id: a.id }); }}>Publier un correctif</button>}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
      {form && (
        <Modal title={form.corrige_annonce_id ? 'Annonce corrective' : 'Nouvelle annonce'} onClose={() => setForm(null)}
          footer={<><button className="btn" onClick={() => setForm(null)}>Annuler</button><button className="btn primary" form="ann">Publier</button></>}>
          <form id="ann" className="stack" onSubmit={publier}>
            <ErrorBox error={error} />
            <Alert tone="warning">Après publication, l'annonce ne pourra plus être modifiée.</Alert>
            <Field label="Titre" required><input value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} required /></Field>
            <Field label="Destinataires"><select value={form.cible} onChange={e => setForm({ ...form, cible: e.target.value })}>{Object.entries(CIBLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Contenu" required><textarea style={{ minHeight: 150 }} value={form.contenu} onChange={e => setForm({ ...form, contenu: e.target.value })} required /></Field>
            <label className="checkbox"><input type="checkbox" checked={form.importante} onChange={e => setForm({ ...form, importante: e.target.checked })} />Marquer comme importante</label>
          </form>
        </Modal>
      )}
    </>
  );
}
