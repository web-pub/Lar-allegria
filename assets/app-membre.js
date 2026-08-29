import {
  auth, db, onAuthStateChanged, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  doc, getDoc, getDocAvecReessai, setDoc, getDocs, collection, addDoc, updateDoc, query, where, serverTimestamp
} from "./firebase-config.js";
import { meteoPour, alerteMeteo, iconeCode } from "./meteo.js";

const VERSION_SITE = 'V13';
document.getElementById('versionTag').textContent = VERSION_SITE;

function dateISOLocale(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${j}`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let membreData = null;
let membreUid = null;
let disponibilites = { joursOuverts: [1,2,3,4,5,6], heureDebut: '09:00', heureFin: '19:00' };

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'connexion.html'; return; }
  const mDoc = await getDocAvecReessai(doc(db, 'membres', user.uid));
  if (!mDoc.exists() || mDoc.data().role !== 'membre') {
    window.location.href = 'connexion.html';
    return;
  }
  if (mDoc.data().archive) {
    alert('Ce compte a été archivé. Contactez Lara si vous pensez qu\'il s\'agit d\'une erreur.');
    await signOut(auth);
    window.location.href = 'connexion.html';
    return;
  }
  membreUid = user.uid;
  membreData = mDoc.data();

  document.getElementById('tabChevalBtn').classList.toggle('hidden', membreData.typeMembre !== 'pension');
  document.getElementById('tabNettoyageBtn').classList.toggle('hidden', membreData.typeMembre !== 'pension');
  document.getElementById('tabBenevolatBtn').classList.toggle('hidden', membreData.typeMembre !== 'benevole');
  document.getElementById('resaTypeChoix').classList.toggle('hidden', membreData.typeMembre !== 'pension');

  afficherAccueil();
  preremplirMonProfil();
  afficherMesChevaux();
  chargerTarifsMembre();
  chargerActivites();
  chargerChat();
  afficherAlerteMessage();
  chargerBoutiqueMembre();
  chargerHistoriquePaiementsMembre();
  chargerStockMembre();
  if (membreData.typeMembre === 'pension') chargerNettoyage();
  if (membreData.typeMembre === 'benevole') chargerPlanningBenevole();

  await chargerDisponibilites();
  await renderGrilleReservations();
  await chargerMesReservations();
});

document.getElementById('chatSendMembre').addEventListener('click', envoyerMessageMembre);
document.getElementById('chatInputMembre').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') envoyerMessageMembre();
});
document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'connexion.html'));

// ==========================================================================
// ACCUEIL
// ==========================================================================
function afficherAccueil() {
  document.getElementById('membreNom').textContent = `${membreData.prenom || ''} ${membreData.nom || ''}`.trim();
  const badgeType = membreData.typeMembre === 'pension'
    ? `<span class="badge badge-neutral">Membre demi-pension</span>`
    : membreData.typeMembre === 'benevole'
    ? `<span class="badge badge-neutral">Membre bénévole</span>`
    : `<span class="badge badge-neutral">Membre cours</span>`;
  const badgeCotis = membreData.cotisationPayee
    ? `<span class="badge badge-ok">Cotisation à jour</span>`
    : `<span class="badge badge-warn">Cotisation à régler</span>`;
  document.getElementById('badgesAbo').innerHTML = badgeType + ' ' + badgeCotis;
  afficherRappelCotisation();
}

function afficherRappelCotisation() {
  const zone = document.getElementById('zoneCotisation');
  if (!membreData.cotisationDateEcheance) { zone.innerHTML = ''; return; }
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dansUnMois = new Date(aujourdhui); dansUnMois.setMonth(aujourdhui.getMonth() + 1);
  const echeance = new Date(membreData.cotisationDateEcheance + 'T00:00:00');
  const dateLabel = echeance.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  const infoDate = `<p style="font-size:0.85rem; color:var(--terre); margin:0 0 8px;">Vous êtes en ordre de cotisation jusqu'au <strong>${dateLabel}</strong>.</p>`;
  if (echeance > dansUnMois) { zone.innerHTML = infoDate; return; }

  if (membreData.cotisationRenouvellement) {
    zone.innerHTML = infoDate + `<div class="banner-alert">Cotisation jusqu'au ${dateLabel} — vous avez indiqué : <strong>${membreData.cotisationRenouvellement === 'oui' ? 'je souhaite renouveler' : 'je ne souhaite pas renouveler'}</strong>. Lara s'en occupe.</div>`;
    return;
  }
  zone.innerHTML = infoDate + `
    <div class="banner-alert">
      Votre cotisation arrive à échéance le ${dateLabel}. Souhaitez-vous la renouveler ?
      <div class="presence-btns">
        <button class="btn-sm primary" onclick="window.repondreCotisation('oui')">Oui, je renouvelle</button>
        <button class="btn-sm" onclick="window.repondreCotisation('non')">Non, pas cette année</button>
      </div>
    </div>`;
}
window.repondreCotisation = async (reponse) => {
  await updateDoc(doc(db, 'membres', membreUid), { cotisationRenouvellement: reponse });
  membreData.cotisationRenouvellement = reponse;
  afficherRappelCotisation();
};

// ==========================================================================
// MON PROFIL
// ==========================================================================
function preremplirMonProfil() {
  const rc = membreData.assuranceRC || {};
  const urg = membreData.contactUrgence || {};
  document.getElementById('mp-gsm').value = membreData.gsm || '';
  document.getElementById('mp-email').value = membreData.email || '';
  document.getElementById('mp-adresse').value = membreData.adressePostale || '';
  document.getElementById('mp-niveau').value = membreData.niveauEquitation || 'debutant';
  document.getElementById('mp-urgenceNom').value = urg.nom || '';
  document.getElementById('mp-urgenceTelephone').value = urg.telephone || '';
  document.getElementById('mp-rcCompagnie').value = rc.compagnie || '';
  document.getElementById('mp-rcNumero').value = rc.numeroPolice || '';
  document.getElementById('mp-rcEcheance').value = rc.dateEcheance || '';
}

document.getElementById('mp-enregistrer').addEventListener('click', async () => {
  const btn = document.getElementById('mp-enregistrer');
  const statut = document.getElementById('mp-statut');
  btn.disabled = true;
  statut.textContent = 'Enregistrement...';
  const data = {
    gsm: document.getElementById('mp-gsm').value.trim(),
    email: document.getElementById('mp-email').value.trim(),
    adressePostale: document.getElementById('mp-adresse').value.trim(),
    niveauEquitation: document.getElementById('mp-niveau').value,
    contactUrgence: {
      nom: document.getElementById('mp-urgenceNom').value.trim(),
      telephone: document.getElementById('mp-urgenceTelephone').value.trim()
    },
    assuranceRC: {
      compagnie: document.getElementById('mp-rcCompagnie').value.trim(),
      numeroPolice: document.getElementById('mp-rcNumero').value.trim(),
      dateEcheance: document.getElementById('mp-rcEcheance').value
    }
  };
  try {
    await updateDoc(doc(db, 'membres', membreUid), data);
    membreData = { ...membreData, ...data };
    document.getElementById('membreNom').textContent = `${membreData.prenom || ''} ${membreData.nom || ''}`.trim();
    statut.textContent = 'Profil enregistré ✓';
  } catch (e) {
    statut.textContent = 'Erreur : ' + e.message;
  }
  btn.disabled = false;
});

document.getElementById('btnChangerMotDePasse').addEventListener('click', async () => {
  const errorBox = document.getElementById('pwError');
  const successBox = document.getElementById('pwSuccess');
  errorBox.classList.remove('show');
  successBox.classList.remove('show');

  const actuel = document.getElementById('pw-actuel').value;
  const nouveau = document.getElementById('pw-nouveau').value;
  const confirme = document.getElementById('pw-confirme').value;

  if (!actuel || !nouveau) {
    errorBox.textContent = 'Merci de remplir le mot de passe actuel et le nouveau mot de passe.';
    errorBox.classList.add('show');
    return;
  }
  if (nouveau.length < 6) {
    errorBox.textContent = 'Le nouveau mot de passe doit contenir au moins 6 caractères.';
    errorBox.classList.add('show');
    return;
  }
  if (nouveau !== confirme) {
    errorBox.textContent = 'La confirmation ne correspond pas au nouveau mot de passe.';
    errorBox.classList.add('show');
    return;
  }

  try {
    const user = auth.currentUser;
    const credential = EmailAuthProvider.credential(user.email, actuel);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, nouveau);
    await updateDoc(doc(db, 'membres', user.uid), { motDePasseActuel: nouveau });
    successBox.classList.add('show');
    document.getElementById('pw-actuel').value = '';
    document.getElementById('pw-nouveau').value = '';
    document.getElementById('pw-confirme').value = '';
  } catch (err) {
    errorBox.textContent = err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password'
      ? 'Mot de passe actuel incorrect.'
      : 'Erreur : ' + (err.code || err.message);
    errorBox.classList.add('show');
  }
});

// ==========================================================================
// MON CHEVAL
// ==========================================================================
function alerteVaccinsCheval(cheval) {
  const aujourdhui = new Date(); aujourdhui.setHours(0,0,0,0);
  const dans30Jours = new Date(aujourdhui); dans30Jours.setDate(aujourdhui.getDate() + 30);
  const v = cheval.vaccins || {};
  const alertes = [];
  [['grippe','Grippe'],['tetanos','Tétanos']].forEach(([cle, label]) => {
    const date = v[cle]?.date;
    if (!date) return;
    const echeance = new Date(date + 'T00:00:00');
    echeance.setFullYear(echeance.getFullYear() + 1);
    if (echeance <= dans30Jours) {
      alertes.push(`${label}${echeance < aujourdhui ? ' en retard' : ' à renouveler bientôt'}`);
    }
  });
  return alertes;
}

function afficherMesChevaux() {
  if (membreData.typeMembre !== 'pension') return;
  const chevaux = (membreData.chevaux || []).filter(c => !c.archive);
  const wrap = document.getElementById('mc-liste');
  if (chevaux.length === 0) {
    wrap.innerHTML = '<p style="color:var(--terre); font-size:0.85rem;">Aucun cheval enregistré pour l\'instant.</p>';
    return;
  }
  wrap.innerHTML = chevaux.map(c => {
    const alertes = alerteVaccinsCheval(c);
    return `
    <div class="horse-card">
      <div class="horse-card-head">
        <div>
          <div class="horse-title">${escapeHtml(c.nom || 'Sans nom')} ${c.race ? '— ' + escapeHtml(c.race) : ''}</div>
          <div class="horse-sub">${c.robe ? escapeHtml(c.robe) + ' · ' : ''}${c.puce ? 'Puce ' + escapeHtml(c.puce) : 'Puce non renseignée'}</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm" type="button" onclick="window.ouvrirFormCheval('${c.id}')">Modifier</button>
          <button class="btn-sm danger" type="button" onclick="window.archiverMonCheval('${c.id}')">Archiver</button>
        </div>
      </div>
      ${alertes.length ? `<div class="banner-alert" style="margin-top:10px; padding:8px 12px;">💉 ${alertes.join(', ')}</div>` : ''}
    </div>`;
  }).join('');
}

document.getElementById('mc-ajouter').addEventListener('click', () => window.ouvrirFormCheval(null));

window.ouvrirFormCheval = (chevalId) => {
  const cheval = chevalId ? (membreData.chevaux || []).find(c => c.id === chevalId) : null;
  const v = cheval?.vaccins || {};
  const html = `
    <div class="modal-overlay" id="modalOverlayCheval">
      <div class="modal-box" style="max-width:520px;">
        <h3>${cheval ? 'Modifier le cheval' : 'Ajouter un cheval'}</h3>
        <div class="form-grid">
          <div class="field"><label>Nom du cheval</label><input id="fc-nom" value="${cheval ? escapeHtml(cheval.nom||'') : ''}"></div>
          <div class="field"><label>Race</label><input id="fc-race" value="${cheval ? escapeHtml(cheval.race||'') : ''}"></div>
          <div class="field"><label>Robe</label><input id="fc-robe" value="${cheval ? escapeHtml(cheval.robe||'') : ''}"></div>
          <div class="field"><label>Date de naissance</label><input type="date" id="fc-naissance" value="${cheval ? (cheval.naissance||'') : ''}"></div>
          <div class="field"><label>Sexe</label>
            <select id="fc-sexe">
              <option value="hongre" ${cheval?.sexe==='hongre' ? 'selected':''}>Hongre</option>
              <option value="jument" ${cheval?.sexe==='jument' ? 'selected':''}>Jument</option>
              <option value="etalon" ${cheval?.sexe==='etalon' ? 'selected':''}>Étalon</option>
            </select>
          </div>
          <div class="field"><label>N° de puce</label><input id="fc-puce" value="${cheval ? escapeHtml(cheval.puce||'') : ''}"></div>
          <div class="field"><label>Vétérinaire traitant</label><input id="fc-veto" value="${cheval ? escapeHtml(cheval.veterinaire||'') : ''}"></div>
          <div class="field"><label>Maréchal-ferrant</label><input id="fc-marechal" value="${cheval ? escapeHtml(cheval.marechal||'') : ''}"></div>
        </div>
        <h3 style="margin-top:16px;">Vaccins</h3>
        <div class="form-grid">
          <div class="field"><label>Grippe — date</label><input type="date" id="fc-vaxGrippe" value="${v.grippe?.date||''}"></div>
          <div class="field"><label>Tétanos — date</label><input type="date" id="fc-vaxTetanos" value="${v.tetanos?.date||''}"></div>
        </div>
        <div class="field"><label>Alimentation particulière / allergies</label><textarea id="fc-alimentation" rows="2">${cheval ? escapeHtml(cheval.alimentationParticuliere||'') : ''}</textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="document.getElementById('modalOverlayCheval').remove()">Annuler</button>
          <button class="btn-sm primary" type="button" id="fc-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);

  document.getElementById('fc-save').addEventListener('click', async () => {
    const nouveauCheval = {
      id: cheval ? cheval.id : 'cheval-' + Date.now(),
      nom: document.getElementById('fc-nom').value.trim(),
      race: document.getElementById('fc-race').value.trim(),
      robe: document.getElementById('fc-robe').value.trim(),
      naissance: document.getElementById('fc-naissance').value,
      sexe: document.getElementById('fc-sexe').value,
      puce: document.getElementById('fc-puce').value.trim(),
      veterinaire: document.getElementById('fc-veto').value.trim(),
      marechal: document.getElementById('fc-marechal').value.trim(),
      alimentationParticuliere: document.getElementById('fc-alimentation').value.trim(),
      archive: false,
      vaccins: {
        grippe: { date: document.getElementById('fc-vaxGrippe').value },
        tetanos: { date: document.getElementById('fc-vaxTetanos').value }
      }
    };
    if (!nouveauCheval.nom) { alert('Merci d\'indiquer le nom du cheval.'); return; }
    const chevauxActuels = membreData.chevaux || [];
    const nouveauxChevaux = cheval
      ? chevauxActuels.map(c => c.id === cheval.id ? nouveauCheval : c)
      : [...chevauxActuels, nouveauCheval];
    await updateDoc(doc(db, 'membres', membreUid), { chevaux: nouveauxChevaux });
    membreData.chevaux = nouveauxChevaux;
    document.getElementById('modalOverlayCheval').remove();
    afficherMesChevaux();
  });
};

window.archiverMonCheval = async (chevalId) => {
  if (!confirm('Archiver ce cheval ? Ses informations resteront conservées.')) return;
  const nouveauxChevaux = (membreData.chevaux || []).map(c => c.id === chevalId ? { ...c, archive: true } : c);
  await updateDoc(doc(db, 'membres', membreUid), { chevaux: nouveauxChevaux });
  membreData.chevaux = nouveauxChevaux;
  afficherMesChevaux();
};

// ==========================================================================
// TARIFS (lecture seule)
// ==========================================================================
function libellePrixMembre(t) {
  if (t.prixTexte) return t.prixTexte;
  if (typeof t.prix === 'number') return `${t.prix.toFixed(2)} €${t.unite ? ' — ' + t.unite : ''}`;
  return '—';
}
async function chargerTarifsMembre() {
  const wrap = document.getElementById('zoneTarifs');
  const snap = await getDocs(collection(db, 'tarifs'));
  const tarifs = [];
  snap.forEach(d => tarifs.push(d.data()));
  if (tarifs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun tarif publié pour l\'instant.</div>';
    return;
  }
  const categories = [...new Set(tarifs.map(t => t.categorie || 'Autres'))];
  wrap.innerHTML = categories.map(cat => `
    <h3 style="margin-top:14px;">${escapeHtml(cat)}</h3>
    <div class="data-list">
      ${tarifs.filter(t => (t.categorie || 'Autres') === cat).map(t => `
        <div class="data-row">
          <div class="data-main">
            <div class="data-title">${escapeHtml(t.nom)}</div>
            ${t.conditions ? `<div class="data-sub">${escapeHtml(t.conditions)}</div>` : ''}
          </div>
          <div class="data-actions"><span class="badge badge-neutral">${libellePrixMembre(t)}</span></div>
        </div>`).join('')}
    </div>`).join('') + '<p style="color:var(--terre); font-size:0.8rem; margin-top:10px;">Prix TTC.</p>';
}

// ==========================================================================
// RÉSERVATIONS — grille hebdomadaire, une seule personne à la fois sur la piste
// Uniquement le futur : navigation bornée entre la semaine en cours et
// 4 semaines (semaine en cours + 3 suivantes).
// ==========================================================================
const NB_SEMAINES_VISIBLES = 4;
let semaineAffichee = lundiDeLaSemaine(new Date());
const semaineMin = lundiDeLaSemaine(new Date());
const semaineMax = (() => { const d = new Date(semaineMin); d.setDate(d.getDate() + (NB_SEMAINES_VISIBLES - 1) * 7); return d; })();
function lundiDeLaSemaine(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const jour = date.getDay(); // 0 = dimanche
  const decalage = jour === 0 ? -6 : 1 - jour;
  date.setDate(date.getDate() + decalage);
  return date;
}

async function chargerDisponibilites() {
  const pDoc = await getDoc(doc(db, 'parametres', 'disponibilites'));
  if (pDoc.exists()) disponibilites = { ...disponibilites, ...pDoc.data() };
}

// Horaires de la piste par jour de la semaine (1 = lundi ... 7 = dimanche) —
// peuvent différer d'un jour à l'autre. Reste compatible avec l'ancien
// format à horaire unique (joursOuverts + heureDebut/heureFin) si l'admin
// n'a pas encore réenregistré ses horaires depuis la mise à jour.
function horaireDuJour(jourISO) {
  if (disponibilites.horaires && disponibilites.horaires[jourISO]) {
    return disponibilites.horaires[jourISO];
  }
  const joursOuverts = disponibilites.joursOuverts || [1,2,3,4,5,6];
  return {
    ouvert: joursOuverts.includes(jourISO),
    heureDebut: disponibilites.heureDebut || '09:00',
    heureFin: disponibilites.heureFin || '19:00'
  };
}

function creneauxHoraires(heureDebut, heureFin) {
  const [hD, mD] = (heureDebut || '09:00').split(':').map(Number);
  const [hF, mF] = (heureFin || '19:00').split(':').map(Number);
  const creneaux = [];
  let h = hD, m = mD || 0;
  while (h < hF || (h === hF && m < mF)) {
    creneaux.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    h += 1;
  }
  return creneaux;
}
async function exceptionJour(dateISO) {
  const d = await getDoc(doc(db, 'disponibilites_exceptions', dateISO));
  return d.exists() ? d.data() : null;
}

document.getElementById('resaSemainePrec').addEventListener('click', () => {
  if (semaineAffichee <= semaineMin) return;
  semaineAffichee.setDate(semaineAffichee.getDate() - 7);
  renderGrilleReservations();
});
document.getElementById('resaSemaineSuiv').addEventListener('click', () => {
  if (semaineAffichee >= semaineMax) return;
  semaineAffichee.setDate(semaineAffichee.getDate() + 7);
  renderGrilleReservations();
});

async function renderGrilleReservations() {
  const grille = document.getElementById('resaGrille');
  const jours = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(semaineAffichee);
    d.setDate(d.getDate() + i);
    jours.push(d);
  }
  const dimanche = jours[6];
  document.getElementById('resaSemaineLabel').textContent =
    `Semaine du ${jours[0].toLocaleDateString('fr-BE', {day:'numeric', month:'long'})} au ${dimanche.toLocaleDateString('fr-BE', {day:'numeric', month:'long'})}`;
  document.getElementById('resaSemainePrec').disabled = semaineAffichee <= semaineMin;
  document.getElementById('resaSemaineSuiv').disabled = semaineAffichee >= semaineMax;

  const dateDebut = dateISOLocale(jours[0]);
  const dateFin = dateISOLocale(dimanche);
  const snap = await getDocs(query(collection(db, 'reservations'),
    where('date', '>=', dateDebut), where('date', '<=', dateFin)));
  const parCle = {};
  snap.forEach(d => {
    const r = d.data();
    if (r.statut === 'annulee' || r.statut === 'refusee') return;
    parCle[`${r.date}_${r.heureDebut}`] = { id: d.id, ...r };
  });

  const maintenant = new Date();

  const blocs = await Promise.all(jours.map(async (d) => {
    const jourISO = d.getDay() === 0 ? 7 : d.getDay();
    const dateISO = dateISOLocale(d);
    const exception = await exceptionJour(dateISO);
    if (exception?.ferme) {
      return `
      <div class="resa-jour">
        <div class="resa-jour-titre">${capitalize(d.toLocaleDateString('fr-BE', {weekday:'short', day:'numeric', month:'short'}))}</div>
        <div class="empty-state" style="margin:0;">Fermé ce jour-là</div>
      </div>`;
    }
    const horaireJour = horaireDuJour(jourISO);
    const ouvertParException = exception && (exception.heureDebut || exception.heureFin);
    if (!horaireJour.ouvert && !ouvertParException) return '';
    const heures = creneauxHoraires(
      exception?.heureDebut || horaireJour.heureDebut,
      exception?.heureFin || horaireJour.heureFin
    );
    const m = await meteoPour(dateISO, '13:00');
    const alerte = alerteMeteo(m);
    const meteoHtml = m
      ? `<span class="meteo" style="${alerte ? 'color:#8A2E2E; font-weight:700;' : ''}">${iconeCode(m.code)} ${m.temperature}°C${alerte ? ' ⚠️' : ''}</span>`
      : '';
    const boutons = heures.map(h => {
      const cle = `${dateISO}_${h}`;
      const resa = parCle[cle];
      const dateHeure = new Date(`${dateISO}T${h}:00`);
      const estPasse = dateHeure < maintenant;
      if (estPasse) return `<button class="creneau-btn passe" disabled>${h}</button>`;
      if (resa) {
        const mine = resa.membreId === membreUid;
        const cls = resa.statut === 'validee' ? 'valide' : 'attente';
        const label = resa.statut === 'validee' ? '✓ pris' : '⏳ attente';
        return `<button class="creneau-btn ${cls} ${mine ? 'mine' : ''}" disabled>${h} — ${label}</button>`;
      }
      return `<button class="creneau-btn" onclick="window.demanderCreneau('${dateISO}','${h}')">${h}</button>`;
    }).join('');
    return `
    <div class="resa-jour">
      <div class="resa-jour-titre">${capitalize(d.toLocaleDateString('fr-BE', {weekday:'short', day:'numeric', month:'short'}))}${meteoHtml}</div>
      <div class="resa-creneaux">${boutons}</div>
    </div>`;
  }));

  grille.innerHTML = blocs.join('') || '<div class="empty-state">Aucun jour d\'ouverture cette semaine.</div>';
}

window.demanderCreneau = async (dateISO, heure) => {
  const type = membreData.typeMembre === 'pension' ? document.getElementById('resa-type').value : 'cours';
  if (!confirm(`Confirmer votre demande de créneau le ${dateISO} à ${heure} (${type === 'cours' ? 'cours de dressage' : 'utilisation libre de la piste'}) ?\n\nCette demande sera envoyée à Lara pour validation.`)) return;
  try {
    await addDoc(collection(db, 'reservations'), {
      membreId: membreUid,
      date: dateISO,
      heureDebut: heure,
      type,
      statut: 'en_attente',
      createdAt: serverTimestamp()
    });
    await renderGrilleReservations();
    await chargerMesReservations();
  } catch (err) {
    alert('Erreur lors de la demande : ' + (err.code || err.message));
  }
};

async function chargerMesReservations() {
  const snap = await getDocs(query(collection(db, 'reservations'), where('membreId', '==', membreUid)));
  let mesResa = [];
  snap.forEach(d => mesResa.push({ id: d.id, ...d.data() }));
  const aujourdhui = dateISOLocale(new Date());
  const aVenir = mesResa.filter(r => r.date >= aujourdhui && r.statut !== 'annulee' && r.statut !== 'refusee').sort((a,b) => (a.date+a.heureDebut).localeCompare(b.date+b.heureDebut));
  const passees = mesResa.filter(r => r.date < aujourdhui || r.statut === 'annulee' || r.statut === 'refusee').sort((a,b) => (b.date+b.heureDebut).localeCompare(a.date+a.heureDebut));

  const wrapListe = document.getElementById('zoneMesReservations');
  const wrapAccueil = document.getElementById('zoneProchaines');
  const wrapHisto = document.getElementById('zoneHistoriqueReservations');

  const ligneResa = async (r, avecMeteo) => {
    const dateLabel = capitalize(new Date(r.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'}));
    let meteoHtml = '';
    if (avecMeteo) {
      const m = await meteoPour(r.date, r.heureDebut);
      const alerte = alerteMeteo(m);
      meteoHtml = m ? `<div class="data-sub">${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%</div>${alerte ? `<div class="banner-alert" style="margin-top:6px; padding:6px 10px;">⚠️ ${alerte.texte}</div>` : ''}` : '';
    }
    const badge = r.statut === 'validee' ? '<span class="badge badge-ok">Validée par Lara</span>'
      : r.statut === 'en_attente' ? '<span class="badge badge-warn">En attente de validation</span>'
      : r.statut === 'refusee' ? '<span class="badge badge-danger">Refusée</span>'
      : '<span class="badge badge-neutral">Annulée</span>';
    const peutAnnuler = (r.statut === 'en_attente' || r.statut === 'validee') && r.date >= aujourdhui;
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${dateLabel} — ${r.heureDebut} (${r.type === 'libre' ? 'piste libre' : 'cours'})</div>
        <div class="data-sub">${badge}</div>
        ${meteoHtml}
      </div>
      ${peutAnnuler ? `<div class="data-actions"><button class="btn-sm danger" onclick="window.annulerMaReservation('${r.id}')">Annuler</button></div>` : ''}
    </div>`;
  };

  wrapListe.innerHTML = mesResa.length ? (await Promise.all([...aVenir, ...passees].map(r => ligneResa(r, false)))).join('') : '<div class="empty-state">Aucune réservation pour l\'instant.</div>';
  wrapAccueil.innerHTML = aVenir.length ? (await Promise.all(aVenir.slice(0,3).map(r => ligneResa(r, true)))).join('') : '<div class="empty-state">Aucune réservation à venir. Rendez-vous dans l\'onglet "Réservations" pour choisir un créneau.</div>';
  wrapHisto.innerHTML = passees.length ? (await Promise.all(passees.map(r => ligneResa(r, false)))).join('') : '<div class="empty-state">Aucun historique pour l\'instant.</div>';
}

window.annulerMaReservation = async (id) => {
  if (!confirm('Annuler cette réservation ?')) return;
  await updateDoc(doc(db, 'reservations', id), { statut: 'annulee' });
  await renderGrilleReservations();
  await chargerMesReservations();
};

// ==========================================================================
// ACTIVITÉS (stages, spectacles) — prix par personne, paiement par virement
// ==========================================================================
async function chargerActivites() {
  const snap = await getDocs(collection(db, 'activites'));
  let activites = [];
  snap.forEach(d => activites.push({ id: d.id, ...d.data() }));
  activites.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const wrap = document.getElementById('zoneActivites');
  if (activites.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune activité prévue pour l\'instant.</div>';
    return;
  }

  const paramDoc = await getDoc(doc(db, 'parametres', 'bancaire'));
  const iban = paramDoc.exists() ? (paramDoc.data().iban || '') : '';

  const reponseSnap = await getDocs(collection(db, 'activites_reponses'));
  const mesReponses = {};
  reponseSnap.forEach(d => {
    const r = d.data();
    if (r.uid === membreUid) mesReponses[r.activiteId] = { id: d.id, ...r };
  });

  wrap.innerHTML = activites.map(a => {
    const dateLabel = a.date ? capitalize(new Date(a.date + 'T00:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })) : '';
    const maReponse = mesReponses[a.id];
    let statutHtml;
    if (maReponse) {
      if (maReponse.statut === 'present') {
        statutHtml = `<span class="badge badge-ok">Vous serez présent(e)${maReponse.nombrePersonnes > 1 ? ` (${maReponse.nombrePersonnes} pers.)` : ''}</span>`;
        if (a.prixParPersonne) {
          statutHtml += `
            <div class="banner-alert" style="margin-top:8px;">
              Montant à payer : <strong>${Number(maReponse.montant || 0).toFixed(2)} €</strong><br>
              ${iban ? `Virement sur : <strong>${escapeHtml(iban)}</strong><br>` : ''}
              Communication : <strong>${escapeHtml(a.titre)} ${escapeHtml(membreData.nom||'')}</strong>
              <div class="presence-btns" style="margin-top:8px;">
                ${maReponse.paye
                  ? '<span class="badge badge-ok">Vous avez indiqué avoir payé</span>' + (maReponse.paiementValide ? ' <span class="badge badge-ok">Validé par Lara</span>' : ' <span class="badge badge-warn">En attente de validation</span>')
                  : `<button class="btn-sm primary" onclick="window.signalerPaiementActivite('${maReponse.id}')">J'ai payé</button>`}
              </div>
            </div>`;
        }
      } else {
        statutHtml = '<span class="badge badge-neutral">Absence signalée</span>';
      }
    } else {
      statutHtml = `
        <div class="field" style="max-width:160px;">
          <label>Nombre de personnes</label>
          <input type="number" min="1" value="1" id="act-nb-${a.id}" style="width:100%;">
        </div>
        <div class="presence-btns">
          <button class="btn-sm primary" onclick="window.repondreActivite('${a.id}','present')">Je serai présent(e)</button>
          <button class="btn-sm" onclick="window.repondreActivite('${a.id}','absent')">Je ne pourrai pas venir</button>
        </div>`;
    }
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.titre)} <span class="badge badge-neutral">${a.type === 'stage' ? 'Stage' : 'Spectacle'}</span></div>
        <div class="data-sub">${dateLabel} ${a.heure || ''} · ${escapeHtml(a.lieu || '')}</div>
        ${a.description ? `<div class="data-sub">${escapeHtml(a.description)}</div>` : ''}
        ${a.prixParPersonne ? `<div class="data-sub">${Number(a.prixParPersonne).toFixed(2)} € / personne</div>` : ''}
        <div style="margin-top:8px;">${statutHtml}</div>
      </div>
    </div>`;
  }).join('');
}

window.repondreActivite = async (activiteId, statut) => {
  const activite = (await getDoc(doc(db, 'activites', activiteId))).data();
  const nombrePersonnes = statut === 'present' ? (parseInt(document.getElementById('act-nb-' + activiteId)?.value, 10) || 1) : 1;
  const montant = activite.prixParPersonne ? activite.prixParPersonne * nombrePersonnes : 0;
  const cle = `${activiteId}_${membreUid}`;
  await setDoc(doc(db, 'activites_reponses', cle), {
    activiteId, uid: membreUid, statut, nombrePersonnes, montant, paye: false, paiementValide: false,
    dateReponse: new Date().toISOString()
  });
  chargerActivites();
};
window.signalerPaiementActivite = async (reponseId) => {
  await updateDoc(doc(db, 'activites_reponses', reponseId), { paye: true });
  chargerActivites();
};

// ==========================================================================
// NETTOYAGE DES BOX
// ==========================================================================
async function chargerNettoyage() {
  const wrap = document.getElementById('zoneNettoyage');
  const snap = await getDocs(query(collection(db, 'nettoyages'), where('assigneA', '==', membreUid)));
  let taches = [];
  snap.forEach(d => taches.push({ id: d.id, ...d.data() }));
  taches.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (taches.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune tâche de nettoyage assignée pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = taches.map(t => {
    const dateLabel = t.date ? capitalize(new Date(t.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'})) : '';
    const badge = t.statut === 'fait' ? '<span class="badge badge-ok">Fait</span>' : '<span class="badge badge-warn">À faire</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(t.boxNom || 'Box')} — ${dateLabel}</div>
        <div class="data-sub">${badge}</div>
      </div>
      ${t.statut !== 'fait' ? `<div class="data-actions"><button class="btn-sm primary" onclick="window.marquerNettoyageFait('${t.id}')">Marquer comme fait</button></div>` : ''}
    </div>`;
  }).join('');
}
window.marquerNettoyageFait = async (id) => {
  await updateDoc(doc(db, 'nettoyages', id), { statut: 'fait', dateRealisation: new Date().toISOString() });
  chargerNettoyage();
};

// ==========================================================================
// PLANNING BÉNÉVOLES (mes créneaux + planning complet de l'équipe)
// ==========================================================================
async function chargerPlanningBenevole() {
  await Promise.all([chargerMesCreneauxBenevole(), chargerPlanningEquipeBenevole()]);
}

async function chargerMesCreneauxBenevole() {
  const wrap = document.getElementById('zoneMesCreneauxBenevole');
  const snap = await getDocs(query(collection(db, 'planning_benevoles'), where('assigneA', '==', membreUid)));
  let creneaux = [];
  snap.forEach(d => creneaux.push({ id: d.id, ...d.data() }));
  creneaux.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure || '').localeCompare(b.heure || ''));
  if (creneaux.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun créneau qui vous soit assigné pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = creneaux.map(c => {
    const dateLabel = c.date ? capitalize(new Date(c.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'})) : '';
    const badge = c.statut === 'fait' ? '<span class="badge badge-ok">Fait</span>' : '<span class="badge badge-warn">À venir</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(c.tache)} — ${dateLabel}${c.heure ? ' à ' + escapeHtml(c.heure) : ''}</div>
        <div class="data-sub">${badge}</div>
      </div>
      ${c.statut !== 'fait' ? `<div class="data-actions"><button class="btn-sm primary" onclick="window.marquerPlanningBenevoleFait('${c.id}')">Marquer comme fait</button></div>` : ''}
    </div>`;
  }).join('');
}
window.marquerPlanningBenevoleFait = async (id) => {
  await updateDoc(doc(db, 'planning_benevoles', id), { statut: 'fait', dateRealisation: new Date().toISOString() });
  chargerMesCreneauxBenevole();
  chargerPlanningEquipeBenevole();
};

async function chargerPlanningEquipeBenevole() {
  const wrap = document.getElementById('zonePlanningEquipeBenevole');
  const snap = await getDocs(collection(db, 'planning_benevoles'));
  let creneaux = [];
  const aujourdhui = dateISOLocale(new Date());
  snap.forEach(d => {
    const c = d.data();
    if (c.statut !== 'fait' && (c.date || '') >= aujourdhui) creneaux.push({ id: d.id, ...c });
  });
  creneaux.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure || '').localeCompare(b.heure || ''));
  if (creneaux.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun créneau à venir dans le planning de l\'équipe.</div>';
    return;
  }
  wrap.innerHTML = creneaux.map(c => {
    const dateLabel = c.date ? capitalize(new Date(c.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'})) : '';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(c.tache)} — ${dateLabel}${c.heure ? ' à ' + escapeHtml(c.heure) : ''}</div>
        <div class="data-sub">Bénévole : ${escapeHtml(c.assigneNom || '—')}</div>
      </div>
    </div>`;
  }).join('');
}

// ==========================================================================
// CHAT AVEC LARA
// ==========================================================================
async function chargerChat() {
  const msgsSnap = await getDocs(collection(db, 'conversations', membreUid, 'messages'));
  const msgs = [];
  msgsSnap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
  msgs.sort((a, b) => (a.dateEnvoi || '').localeCompare(b.dateEnvoi || ''));
  const wrap = document.getElementById('chatThreadMembre');
  wrap.innerHTML = msgs.map(m => bulleMessage(m)).join('') || '<div class="empty-state">Aucun message pour l\'instant. Dites bonjour à Lara !</div>';
  wrap.scrollTop = 999999;
}
async function marquerChatLu() {
  const msgsSnap = await getDocs(collection(db, 'conversations', membreUid, 'messages'));
  const nonLus = [];
  msgsSnap.forEach(d => { const m = d.data(); if (m.expediteur === 'admin' && !m.lu) nonLus.push(d.id); });
  if (nonLus.length > 0) {
    await Promise.all(nonLus.map(id => updateDoc(doc(db, 'conversations', membreUid, 'messages', id), { lu: true })));
    await setDoc(doc(db, 'conversations', membreUid), { nonLuMembre: false }, { merge: true });
  }
  document.getElementById('zoneAlerteMessage').innerHTML = '';
  document.getElementById('tabMessagesBtn')?.classList.remove('has-unread');
  chargerChat();
}
async function afficherAlerteMessage() {
  const convDoc = await getDoc(doc(db, 'conversations', membreUid));
  const zone = document.getElementById('zoneAlerteMessage');
  const nonLu = convDoc.exists() && convDoc.data().nonLuMembre;
  document.getElementById('tabMessagesBtn')?.classList.toggle('has-unread', !!nonLu);
  zone.innerHTML = nonLu ? `<div class="alerte-message" onclick="window.ouvrirMessagesEtLire()">💬 Vous avez un nouveau message de Lara — cliquez pour le lire</div>` : '';
}
window.ouvrirMessagesEtLire = () => {
  document.querySelector('.tab-btn[data-tab="messages"]').click();
  marquerChatLu();
};
window.marquerMessagesLusDepuisAccordeon = () => marquerChatLu();

async function envoyerMessageMembre() {
  const input = document.getElementById('chatInputMembre');
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  const maintenant = new Date().toISOString();
  await addDoc(collection(db, 'conversations', membreUid, 'messages'), { texte, expediteur: 'membre', dateEnvoi: maintenant, lu: false });
  await setDoc(doc(db, 'conversations', membreUid), { dernierMessage: texte, dateDernierMessage: maintenant, nonLuAdmin: true }, { merge: true });
  chargerChat();
}
function bulleMessage(m) {
  const estMoi = m.expediteur === 'membre';
  const heure = m.dateEnvoi ? new Date(m.dateEnvoi).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
  const coche = estMoi ? `<span class="chat-check ${m.lu ? 'lu' : ''}">${m.lu ? '✓✓' : '✓'}</span>` : '';
  return `<div class="chat-bubble ${estMoi ? 'moi' : 'autre'}">${escapeHtml(m.texte)}<div class="chat-meta">${heure} ${coche}</div></div>`;
}

// ==========================================================================
// BOUTIQUE — panier local, commande à valider par l'admin
// ==========================================================================
let panierLocal = [];
async function chargerBoutiqueMembre() {
  const wrap = document.getElementById('zoneArticlesBoutique');
  try {
    const snap = await getDocs(query(collection(db, 'articles_boutique'), where('actif', '==', true)));
    const articles = [];
    snap.forEach(d => articles.push({ id: d.id, ...d.data() }));
    if (articles.length === 0) {
      wrap.innerHTML = '<div class="empty-state">Aucun article disponible pour l\'instant.</div>';
    } else {
      wrap.innerHTML = articles.map(a => `
        <div class="data-row">
          ${a.photoURL ? `<img src="${escapeHtml(a.photoURL)}" style="width:52px; height:52px; border-radius:6px; object-fit:cover; flex:none;">` : ''}
          <div class="data-main">
            <div class="data-title">${escapeHtml(a.nom)}</div>
            <div class="data-sub">${Number(a.prix).toFixed(2)} € TTC · ${a.stock > 0 ? `${a.stock} en stock` : '<span class="badge badge-danger">Rupture de stock</span>'}</div>
          </div>
          <div class="data-actions">
            <button class="btn-sm primary" ${a.stock <= 0 ? 'disabled' : ''} onclick="window.ajouterAuPanier('${a.id}', '${escapeHtml(a.nom)}', ${a.prix}, ${a.stock})">Ajouter au panier</button>
          </div>
        </div>`).join('');
    }
  } catch (err) {
    wrap.innerHTML = `<div class="banner-alert danger">Erreur : ${escapeHtml(err.code || '')} — ${escapeHtml(err.message || String(err))}</div>`;
    return;
  }
  afficherPanier();
  chargerMesCommandes();
}
window.ajouterAuPanier = (articleId, nom, prix, stock) => {
  const existant = panierLocal.find(l => l.articleId === articleId);
  if (existant) {
    if (existant.quantite >= stock) { alert('Stock insuffisant.'); return; }
    existant.quantite++;
  } else {
    panierLocal.push({ articleId, nom, prix, quantite: 1 });
  }
  afficherPanier();
};
window.retirerDuPanier = (articleId) => {
  panierLocal = panierLocal.filter(l => l.articleId !== articleId);
  afficherPanier();
};
function afficherPanier() {
  const wrap = document.getElementById('zonePanier');
  const totalEl = document.getElementById('panierTotal');
  if (panierLocal.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Panier vide.</div>';
    totalEl.textContent = '';
    return;
  }
  wrap.innerHTML = panierLocal.map(l => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${l.quantite} × ${escapeHtml(l.nom)}</div>
        <div class="data-sub">${(l.prix * l.quantite).toFixed(2)} € TTC</div>
      </div>
      <div class="data-actions"><button class="btn-sm danger" onclick="window.retirerDuPanier('${l.articleId}')">Retirer</button></div>
    </div>`).join('');
  const total = panierLocal.reduce((s, l) => s + l.prix * l.quantite, 0);
  totalEl.textContent = `Total : ${total.toFixed(2)} € TTC`;
}
document.getElementById('btnValiderPanier').addEventListener('click', async () => {
  if (panierLocal.length === 0) { alert('Votre panier est vide.'); return; }
  const total = panierLocal.reduce((s, l) => s + l.prix * l.quantite, 0);
  await addDoc(collection(db, 'commandes'), {
    membreId: membreUid,
    lignes: panierLocal.map(l => ({ articleId: l.articleId, nom: l.nom, prixUnitaire: l.prix, quantite: l.quantite })),
    total, statut: 'en_attente', dateCreation: serverTimestamp()
  });
  panierLocal = [];
  afficherPanier();
  alert('Commande envoyée à Lara pour validation.');
  chargerMesCommandes();
});
async function chargerMesCommandes() {
  const snap = await getDocs(query(collection(db, 'commandes'), where('membreId', '==', membreUid)));
  const commandes = [];
  snap.forEach(d => commandes.push({ id: d.id, ...d.data() }));
  commandes.sort((a, b) => (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0));
  const wrap = document.getElementById('zoneMesCommandes');
  if (commandes.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune commande pour l\'instant.</div>';
    return;
  }
  wrap.innerHTML = commandes.map(c => {
    const detail = (c.lignes || []).map(l => `${l.quantite} × ${escapeHtml(l.nom)}`).join(', ');
    const badge = c.statut === 'validee' ? '<span class="badge badge-ok">Validée</span>'
      : c.statut === 'annulee' ? '<span class="badge badge-danger">Annulée</span>'
      : '<span class="badge badge-warn">En attente</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${Number(c.total).toFixed(2)} € TTC ${badge}</div>
        <div class="data-sub">${detail}</div>
      </div>
    </div>`;
  }).join('');
}

// ==========================================================================
// HISTORIQUE DE MES PAIEMENTS (lecture seule)
// ==========================================================================
async function chargerHistoriquePaiementsMembre() {
  const zone = document.getElementById('zonePaiements');
  const snap = await getDocs(query(collection(db, 'paiements'), where('membreId', '==', membreUid)));
  const paiements = [];
  snap.forEach(d => paiements.push(d.data()));
  paiements.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (paiements.length === 0) {
    zone.innerHTML = '<div class="empty-state">Aucun paiement enregistré pour l\'instant.</div>';
    return;
  }
  zone.innerHTML = paiements.map(p => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(p.type)} — ${Number(p.montant).toFixed(2)} € TTC</div>
        <div class="data-sub">${p.date || ''}${p.note ? ' · ' + escapeHtml(p.note) : ''}</div>
      </div>
    </div>`).join('');
}

// ==========================================================================
// STOCK — les membres peuvent signaler une prise
// ==========================================================================
let stockCache = [];
async function chargerStockMembre() {
  const wrap = document.getElementById('zoneStockMembre');
  try {
    const snap = await getDocs(collection(db, 'stock'));
    stockCache = [];
    snap.forEach(d => stockCache.push({ id: d.id, ...d.data() }));
    if (stockCache.length === 0) {
      wrap.innerHTML = '<div class="empty-state">Aucun article de stock enregistré pour l\'instant.</div>';
      return;
    }
    wrap.innerHTML = stockCache.map(s => `
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${escapeHtml(s.nom)}</div>
          <div class="data-sub">${s.quantite <= 0 ? '<span class="badge badge-danger">Épuisé</span>' : `${s.quantite} ${escapeHtml(s.unite || '')} en stock`}</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm" ${s.quantite <= 0 ? 'disabled' : ''} onclick="window.signalerPriseStock('${s.id}')">J'ai pris quelque chose</button>
        </div>
      </div>`).join('');
  } catch (err) {
    wrap.innerHTML = `<div class="banner-alert danger">Erreur : ${escapeHtml(err.code || '')} — ${escapeHtml(err.message || String(err))}</div>`;
  }
}
window.signalerPriseStock = async (id) => {
  const item = stockCache.find(s => s.id === id);
  if (!item) return;
  const quantiteStr = prompt(`Quelle quantité de "${item.nom}" avez-vous prise ? (unité : ${item.unite || '—'})`, '1');
  if (quantiteStr === null) return;
  const quantite = parseFloat(quantiteStr.replace(',', '.'));
  if (!quantite || quantite <= 0) { alert('Merci d\'indiquer une quantité valide.'); return; }
  const nouvelleQuantite = Math.max(0, (item.quantite || 0) - quantite);
  try {
    await updateDoc(doc(db, 'stock', id), { quantite: nouvelleQuantite });
    await addDoc(collection(db, 'stock_signalements'), {
      membreId: membreUid,
      stockId: id,
      nom: item.nom,
      quantitePrise: quantite,
      unite: item.unite || '',
      dateSignalement: new Date().toISOString()
    });
    await chargerStockMembre();
  } catch (err) {
    alert('Erreur : ' + (err.code || err.message));
  }
};

// Filet de sécurité : si une zone reste bloquée sur "..." après un moment.
setTimeout(() => {
  document.querySelectorAll('.empty-state').forEach(el => {
    if (el.textContent.trim() === '...') {
      el.textContent = 'Page vide — une erreur a peut-être empêché le chargement. Recharge la page (Ctrl+F5).';
    }
  });
}, 7000);
