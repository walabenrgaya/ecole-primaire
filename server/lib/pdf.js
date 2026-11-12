import PDFDocument from 'pdfkit';

const INK = '#0E2A3B';
const ACCENT = '#0F766E';
const MUTED = '#5B6B76';
const LINE = '#D9DEE2';

const fmtDate = d => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const money = n => `${(+n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TND`;

function header(doc, school, titre, sousTitre) {
  doc.rect(0, 0, doc.page.width, 92).fill(INK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text(school?.name || 'Établissement', 50, 28);
  doc.font('Helvetica').fontSize(9).fillColor('#C9D6DE')
    .text([school?.adresse, school?.ville, school?.telephone].filter(Boolean).join('  ·  '), 50, 50);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text(titre.toUpperCase(), 50, 28, { align: 'right', width: doc.page.width - 100 });
  if (sousTitre) doc.font('Helvetica').fontSize(9).fillColor('#C9D6DE').text(sousTitre, 50, 46, { align: 'right', width: doc.page.width - 100 });
  doc.fillColor(INK);
  doc.y = 120;
}

function footer(doc, txt) {
  const y = doc.page.height - 60;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(LINE).lineWidth(0.5).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(txt, 50, y + 10, { width: doc.page.width - 100, align: 'center' });
}

function kv(doc, x, y, label, value, w = 230) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, y, { width: w });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(value ?? '—', x, y + 11, { width: w });
}

/** Reçu de paiement officiel */
export function recuPdf(res, { school, paiement, eleve, classe, situation }) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="recu-${paiement.recu_num}.pdf"`);
  doc.pipe(res);
  header(doc, school, 'Reçu de paiement', `N° ${paiement.recu_num}`);

  kv(doc, 50, 130, 'Élève', `${eleve.nom} ${eleve.prenom}`);
  kv(doc, 300, 130, 'Classe', classe || '—');
  kv(doc, 50, 170, 'Matricule', eleve.matricule);
  kv(doc, 300, 170, 'Année scolaire', paiement.annee_scolaire);
  kv(doc, 50, 210, 'Date du paiement', fmtDate(paiement.date));
  kv(doc, 300, 210, 'Mode de paiement', paiement.mode);

  doc.roundedRect(50, 262, doc.page.width - 100, 80, 6).fill('#EEF6F5');
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('MONTANT REÇU', 70, 280);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(26).text(money(paiement.montant), 70, 295);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('OBJET', 330, 280);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12).text(paiement.type || 'Scolarité', 330, 296, { width: 200 });

  const y = 370;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text('Situation financière', 50, y);
  const rows = [
    ['Total des frais de l\'année', money(situation.du)],
    ['Total payé à ce jour', money(situation.paye)],
    ['Solde restant', money(situation.reste)]
  ];
  rows.forEach(([l, v], i) => {
    const yy = y + 24 + i * 24;
    doc.moveTo(50, yy + 18).lineTo(doc.page.width - 50, yy + 18).strokeColor(LINE).lineWidth(0.5).stroke();
    doc.font(i === 2 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(INK).text(l, 50, yy);
    doc.text(v, 50, yy, { width: doc.page.width - 100, align: 'right' });
  });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    .text('Cachet et signature du service financier', 330, 520)
    .rect(330, 536, 215, 70).strokeColor(LINE).stroke();
  footer(doc, `Reçu généré automatiquement le ${fmtDate(new Date())} – document faisant foi de paiement.`);
  doc.end();
}

/** Bulletin scolaire officiel */
export function bulletinPdf(res, b) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="bulletin-${b.eleve.matricule || b.eleve.id}.pdf"`);
  doc.pipe(res);
  header(doc, b.school, 'Bulletin scolaire', `${b.trimestre ? `Trimestre ${b.trimestre}` : 'Bilan annuel'} · ${b.annee}`);

  kv(doc, 50, 120, 'Élève', `${b.eleve.nom} ${b.eleve.prenom}`, 180);
  kv(doc, 240, 120, 'Classe', b.classe, 120);
  kv(doc, 370, 120, 'Matricule', b.eleve.matricule, 180);

  // Tableau des matières
  let y = 175;
  const cols = [50, 230, 280, 450];
  doc.rect(50, y, doc.page.width - 100, 22).fill(INK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  doc.text('MATIÈRE', cols[0] + 8, y + 7);
  doc.text('COEF.', cols[1], y + 7);
  doc.text('NOTES', cols[2], y + 7);
  doc.text('MOYENNE', cols[3], y + 7, { width: 87, align: 'right' });
  y += 22;
  b.lignes.forEach((l, i) => {
    if (i % 2 === 0) doc.rect(50, y, doc.page.width - 100, 22).fill('#F4F6F7');
    doc.fillColor(INK).font('Helvetica').fontSize(9.5).text(l.matiere, cols[0] + 8, y + 7, { width: 170 });
    doc.text(String(l.coef), cols[1], y + 7);
    const notesTxt = l.notes.map(n => `${n.eval === 'Examen' ? 'Ex' : 'CC'}${b.trimestre ? '' : n.trimestre} ${n.note}`).join('  ');
    doc.fillColor(MUTED).fontSize(8).text(notesTxt || '—', cols[2], y + 7, { width: 160, height: 12, ellipsis: true });
    doc.fillColor(l.moyenne != null && l.moyenne < 10 ? '#B42318' : INK).font('Helvetica-Bold').fontSize(10)
      .text(l.moyenne != null ? l.moyenne.toFixed(2) : '—', cols[3], y + 6, { width: 87, align: 'right' });
    y += 22;
  });

  // Synthèse
  y += 20;
  doc.roundedRect(50, y, doc.page.width - 100, 86, 6).fill('#EEF6F5');
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('MOYENNE GÉNÉRALE', 70, y + 16);
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(28).text(b.moyenneGenerale != null ? b.moyenneGenerale.toFixed(2) : '—', 70, y + 30);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(b.mention, 70, y + 64);
  kv(doc, 260, y + 16, 'Rang', b.rang ? `${b.rang} / ${b.effectif}` : '—', 120);
  kv(doc, 260, y + 50, 'Moyenne de la classe', b.moyenneClasse != null ? b.moyenneClasse.toFixed(2) : '—', 120);
  kv(doc, 400, y + 16, 'Absences', `${b.absences.total} (dont ${b.absences.justifiees} justifiées)`, 150);
  kv(doc, 400, y + 50, 'Retards', String(b.absences.retards), 150);

  y += 110;
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(`Moyenne par matière = ${b.ponderation.controleContinu * 100} % contrôle continu + ${b.ponderation.examen * 100} % examen. Moyenne générale pondérée par les coefficients.`, 50, y, { width: doc.page.width - 100 });
  doc.text('Visa de la direction', 380, y + 40).rect(380, y + 54, 165, 60).strokeColor(LINE).stroke();
  footer(doc, `Bulletin généré le ${fmtDate(new Date())}`);
  doc.end();
}
