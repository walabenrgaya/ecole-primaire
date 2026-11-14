export const NIVEAUX = ['CP', 'CE1', 'CE2', 'CM1', 'CM2'];
export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
export const CRENEAUX = [['08:30', '10:00'], ['10:15', '11:45'], ['14:00', '15:30'], ['15:45', '17:15']];
export const MODES = ['Espèces', 'Virement', 'Mobile money', 'Chèque'];

export const ROLE_LABEL = {
  superadmin: 'Éditeur SaaS', admin: 'Administrateur', directeur: 'Directeur', enseignant: 'Enseignant',
  comptable: 'Comptable', parent: 'Parent', eleve: 'Élève'
};

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Remplace l'espace fine insécable (absente de certaines polices) par une espace normale
const fx = (f, v) => f.format(v).replace(/[  ]/g, ' ');
export const num = (v, d = 0) => (v == null || Number.isNaN(+v) ? '—' : fx(d === 0 ? nf0 : d === 1 ? nf1 : nf2, +v));
export const money = v => (v == null ? '—' : `${fx(nf0, +v)} TND`);
export const money2 = v => (v == null ? '—' : `${fx(nf2, +v)} TND`);
export const pct = v => (v == null ? '—' : `${fx(nf1, +v)} %`);
export const note = v => (v == null ? '—' : nf2.format(+v));
export const compact = v => (Math.abs(v) >= 1000 ? `${fx(nf1, v / 1000)} k` : fx(nf0, v));

export const date = v => (v ? new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const dateLong = v => (v ? new Date(v).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—');
export const dateTime = v => (v ? new Date(v).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const isoDate = v => (v ? new Date(v).toISOString().slice(0, 10) : '');
export const hhmm = v => (v ? String(v).slice(0, 5) : '');

export function relative(v) {
  if (!v) return 'jamais';
  const s = (Date.now() - new Date(v).getTime()) / 1000;
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
  return date(v);
}

export const initials = name => (name || '?').replace(/^(M\.|Mme)\s+/, '').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const moyenneTone = m => (m == null ? '' : m >= 14 ? 'success' : m >= 10 ? 'accent' : m >= 8 ? 'warning' : 'danger');
