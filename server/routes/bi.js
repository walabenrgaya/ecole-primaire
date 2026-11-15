import express from 'express';
import { auth, only, needSchool, wrap, fail } from '../lib/http.js';
import { audit } from '../lib/audit.js';
import * as BI from '../lib/bi.js';

const r = express.Router();

r.get('/bi/plateforme', auth, only(), wrap(async (req, res) => res.json(await BI.plateforme())));

const TABLEAUX = {
  general: d => BI.general(d),
  finances: d => BI.finances(d),
  pedagogie: (d, q) => BI.pedagogie(d, q.trimestre ? +q.trimestre : null),
  absences: d => BI.absences(d),
  enseignants: d => BI.enseignants(d),
  inscriptions: d => BI.inscriptions(d),
  communication: d => BI.communication(d),
  ressources: d => BI.ressources(d),
  risques: d => BI.risques(d),
  strategie: (d, q) => BI.strategie(d, q)
};

// Module réservé à la direction, à l'administration (et au comptable pour le volet financier)
r.get('/bi/:tableau', auth, needSchool, wrap(async (req, res) => {
  const fn = TABLEAUX[req.params.tableau];
  if (!fn) fail(404, 'Tableau de bord inconnu');
  const role = req.u.role;
  const autorise = ['superadmin', 'admin', 'directeur'].includes(role) || (role === 'comptable' && req.params.tableau === 'finances');
  if (!autorise) fail(403, 'Module réservé à la direction');
  if (req.query.refresh) BI.invalidate(req.u.schoolId);
  const d = await BI.dataset(req.u.schoolId);
  if (req.params.tableau === 'strategie') await audit(req.u, 'Consultation BI stratégie', { data: req.query });
  res.json(fn(d, req.query));
}));

export default r;
