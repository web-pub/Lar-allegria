import {
  auth, db, onAuthStateChanged, signOut,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  creerCompteMembre, reinitialiserMotDePasseCompte,
  doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, addDoc, query, where, orderBy, serverTimestamp
} from "./firebase-config.js";
import { meteoPour, alerteMeteo, iconeCode } from "./meteo.js";

const VERSION_SITE = 'V15';
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
function lundiDeLaSemaine(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  const jour = date.getDay();
  const decalage = jour === 0 ? -6 : 1 - jour;
  date.setDate(date.getDate() + decalage);
  return date;
}

let membresCache = [];
let membresParUid = {};
let compteActuel = null; // { role, identifiant, ... } du compte connecté

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'connexion.html'; return; }
  const mDoc = await getDoc(doc(db, 'membres', user.uid));
  if (!mDoc.exists() || !['admin', 'superadmin'].includes(mDoc.data().role)) {
    window.location.href = 'connexion.html';
    return;
  }
  compteActuel = mDoc.data();
  document.getElementById('adminNom').textContent = compteActuel.prenom || 'Lara';
  if (compteActuel.role === 'superadmin') {
    document.getElementById('tabMotsDePasseBtn').classList.remove('hidden');
    chargerMotsDePasseAdmin();
    chargerSauvegardesMdp();
  }

  await chargerMembres();
  chargerMeteoResume();
  chargerReservationsAttente();
  renderPlanningSemaine();
  chargerDemandesInscription();
  renderMembres();
  chargerBoxes();
  chargerNettoyages();
  chargerTarifs();
  chargerIban();
  chargerActivites();
  chargerConversations();
  chargerDisponibilitesAdmin();
  chargerExceptionsAdmin();
  chargerBoutiqueAdmin();
  chargerCommandesAdmin();
  chargerChevauxAdmin();
  chargerEvenementsAdmin();
  chargerBlogAdmin();
  chargerStockAdmin();
  chargerStockSignalements();
  chargerContenuAdmin();
  chargerPlanningBenevolesAdmin();
});

document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = 'connexion.html'));

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.remove('hidden');
  });
});

window.fermerModal = () => { document.getElementById('modalZone').innerHTML = ''; };

// ==========================================================================
// MÉTÉO — résumé des prochains jours
// ==========================================================================
async function chargerMeteoResume() {
  const zone = document.getElementById('meteoResume');
  const jours = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    jours.push(d);
  }
  const blocs = await Promise.all(jours.map(async (d) => {
    const dateISO = dateISOLocale(d);
    const m = await meteoPour(dateISO, '13:00');
    const alerte = alerteMeteo(m);
    return `<div class="data-row" style="flex:1 1 140px;">
      <div class="data-main">
        <div class="data-title">${capitalize(d.toLocaleDateString('fr-BE', {weekday:'short', day:'numeric'}))}</div>
        <div class="data-sub">${m ? `${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%` : 'Météo indisponible'}</div>
        ${alerte ? `<div class="badge badge-${alerte.niveau === 'danger' ? 'danger' : 'warn'}" style="margin-top:4px;">⚠️ ${alerte.texte}</div>` : ''}
      </div>
    </div>`;
  }));
  zone.innerHTML = `<div style="display:flex; flex-wrap:wrap; gap:10px;">${blocs.join('')}</div>`;
}

// ==========================================================================
// MEMBRES (cache utilisé par plusieurs sections)
// ==========================================================================
async function chargerMembres() {
  const snap = await getDocs(collection(db, 'membres'));
  membresCache = [];
  membresParUid = {};
  snap.forEach(d => {
    const m = { id: d.id, ...d.data() };
    if (m.role !== 'admin' && m.role !== 'superadmin') membresCache.push(m);
    membresParUid[d.id] = m;
  });
}
function nomMembre(uid) {
  const m = membresParUid[uid];
  return m ? `${m.prenom || ''} ${m.nom || ''}`.trim() || m.identifiant || uid : uid;
}
function labelTypeMembre(type) {
  if (type === 'pension') return 'Membre demi-pension';
  if (type === 'benevole') return 'Membre bénévole';
  return 'Membre cours';
}

// ==========================================================================
// RÉSERVATIONS — validation (une seule personne à la fois sur la piste)
// ==========================================================================
async function chargerReservationsAttente() {
  const snap = await getDocs(query(collection(db, 'reservations'), where('statut', '==', 'en_attente')));
  let resa = [];
  snap.forEach(d => resa.push({ id: d.id, ...d.data() }));
  resa.sort((a, b) => (a.date + a.heureDebut).localeCompare(b.date + b.heureDebut));

  const wrap = document.getElementById('listeReservationsAttente');
  if (resa.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune demande en attente.</div>';
    return;
  }

  const lignes = await Promise.all(resa.map(async (r) => {
    const dateLabel = capitalize(new Date(r.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'}));
    const m = await meteoPour(r.date, r.heureDebut);
    const alerte = alerteMeteo(m);
    const meteoHtml = m ? `<span class="badge badge-neutral">${iconeCode(m.code)} ${m.temperature}°C · pluie ${m.pluie}%</span>` : '';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(nomMembre(r.membreId))} — ${dateLabel} ${r.heureDebut}</div>
        <div class="data-sub">${r.type === 'libre' ? 'Piste libre' : 'Cours de dressage'} ${meteoHtml}</div>
        ${alerte ? `<div class="banner-alert" style="margin-top:6px; padding:6px 10px;">⚠️ ${alerte.texte}</div>` : ''}
      </div>
      <div class="data-actions">
        <button class="btn-sm primary" onclick="window.validerReservation('${r.id}','${r.date}','${r.heureDebut}')">Valider</button>
        <button class="btn-sm danger" onclick="window.refuserReservation('${r.id}')">Refuser</button>
      </div>
    </div>`;
  }));
  wrap.innerHTML = lignes.join('');
}

window.validerReservation = async (id, dateISO, heure) => {
  const snap = await getDocs(query(collection(db, 'reservations'), where('date', '==', dateISO), where('heureDebut', '==', heure), where('statut', '==', 'validee')));
  if (!snap.empty) {
    alert("Attention : une autre réservation est déjà validée sur ce créneau (une seule personne à la fois sur la piste). Refuse-la d'abord si tu veux valider celle-ci à la place.");
    return;
  }
  await updateDoc(doc(db, 'reservations', id), { statut: 'validee' });
  chargerReservationsAttente();
  renderPlanningSemaine();
};
window.refuserReservation = async (id) => {
  await updateDoc(doc(db, 'reservations', id), { statut: 'refusee' });
  chargerReservationsAttente();
  renderPlanningSemaine();
};

let semaineAdminAffichee = lundiDeLaSemaine(new Date());
document.getElementById('resaAdminSemainePrec').addEventListener('click', () => {
  semaineAdminAffichee.setDate(semaineAdminAffichee.getDate() - 7);
  renderPlanningSemaine();
});
document.getElementById('resaAdminSemaineSuiv').addEventListener('click', () => {
  semaineAdminAffichee.setDate(semaineAdminAffichee.getDate() + 7);
  renderPlanningSemaine();
});

async function renderPlanningSemaine() {
  const jours = [];
  for (let i = 0; i < 7; i++) { const d = new Date(semaineAdminAffichee); d.setDate(d.getDate()+i); jours.push(d); }
  document.getElementById('resaAdminSemaineLabel').textContent =
    `Semaine du ${jours[0].toLocaleDateString('fr-BE', {day:'numeric', month:'long'})} au ${jours[6].toLocaleDateString('fr-BE', {day:'numeric', month:'long'})}`;

  const dateDebut = dateISOLocale(jours[0]);
  const dateFin = dateISOLocale(jours[6]);
  const snap = await getDocs(query(collection(db, 'reservations'), where('date', '>=', dateDebut), where('date', '<=', dateFin)));
  let resa = [];
  snap.forEach(d => { const r = d.data(); if (r.statut === 'validee' || r.statut === 'en_attente') resa.push({ id: d.id, ...r }); });
  resa.sort((a,b) => (a.date+a.heureDebut).localeCompare(b.date+b.heureDebut));

  const wrap = document.getElementById('listePlanningSemaine');
  if (resa.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune réservation cette semaine.</div>';
    return;
  }
  wrap.innerHTML = resa.map(r => {
    const dateLabel = capitalize(new Date(r.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'}));
    const badge = r.statut === 'validee' ? '<span class="badge badge-ok">Validée</span>' : '<span class="badge badge-warn">En attente</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${dateLabel} ${r.heureDebut} — ${escapeHtml(nomMembre(r.membreId))}</div>
        <div class="data-sub">${r.type === 'libre' ? 'Piste libre' : 'Cours de dressage'} ${badge}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm danger" onclick="window.annulerReservationAdmin('${r.id}')">Annuler</button>
      </div>
    </div>`;
  }).join('');
}
window.annulerReservationAdmin = async (id) => {
  if (!confirm('Annuler cette réservation ?')) return;
  await updateDoc(doc(db, 'reservations', id), { statut: 'annulee' });
  chargerReservationsAttente();
  renderPlanningSemaine();
};

// ==========================================================================
// DEMANDES D'INSCRIPTION
// ==========================================================================
async function chargerDemandesInscription() {
  const snap = await getDocs(query(collection(db, 'demandes_inscription'), where('statut', '==', 'en_attente')));
  let demandes = [];
  snap.forEach(d => demandes.push({ id: d.id, ...d.data() }));
  demandes.sort((a, b) => (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0));

  document.getElementById('tabMembresBtn').classList.toggle('has-unread', demandes.length > 0);

  const wrap = document.getElementById('listeDemandesInscription');
  if (demandes.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucune demande en attente.</div>';
    return;
  }
  wrap.innerHTML = demandes.map(d => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(d.prenom)} ${escapeHtml(d.nom)} — ${labelTypeMembre(d.typeMembre)}</div>
        <div class="data-sub">${escapeHtml(d.email)} · ${escapeHtml(d.telephone)}${d.cheval?.nom ? ` · Cheval : ${escapeHtml(d.cheval.nom)}` : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm primary" onclick="window.voirDemande('${d.id}')">Voir / Convertir en membre</button>
        <button class="btn-sm danger" onclick="window.rejeterDemande('${d.id}')">Rejeter</button>
      </div>
    </div>`).join('');

  window._demandesInscription = {};
  demandes.forEach(d => window._demandesInscription[d.id] = d);
}
window.rejeterDemande = async (id) => {
  if (!confirm('Rejeter cette demande ?')) return;
  await updateDoc(doc(db, 'demandes_inscription', id), { statut: 'rejetee' });
  chargerDemandesInscription();
};
window.voirDemande = (id) => {
  const d = window._demandesInscription[id];
  const html = `
    <div class="modal-overlay" id="modalOverlayDemande">
      <div class="modal-box" style="max-width:560px;">
        <h3>Demande de ${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</h3>
        <div style="font-size:0.9rem; line-height:1.7; max-height:50vh; overflow-y:auto;">
          <p><strong>Type :</strong> ${labelTypeMembre(d.typeMembre)}<br>
          <strong>Naissance :</strong> ${d.dateNaissance || '—'}<br>
          <strong>Téléphone :</strong> ${escapeHtml(d.telephone)}<br>
          <strong>Email :</strong> ${escapeHtml(d.email)}<br>
          <strong>Adresse :</strong> ${escapeHtml(d.adresse?.rue)}, ${escapeHtml(d.adresse?.cp)} ${escapeHtml(d.adresse?.ville)}<br>
          <strong>Contact urgence :</strong> ${escapeHtml(d.contactUrgence?.nom)} (${escapeHtml(d.contactUrgence?.lien||'')}) — ${escapeHtml(d.contactUrgence?.telephone)}<br>
          <strong>Niveau :</strong> ${escapeHtml(d.niveauEquitation)}<br>
          ${d.experience ? `<strong>Expérience :</strong> ${escapeHtml(d.experience)}<br>` : ''}
          <strong>Assurance RC :</strong> ${escapeHtml(d.assuranceRC?.compagnie||'—')} ${escapeHtml(d.assuranceRC?.numeroPolice||'')}<br>
          <strong>Droit à l'image :</strong> ${d.droitImage ? 'Oui' : 'Non'}</p>
          ${d.cheval ? `<p><strong>Cheval :</strong> ${escapeHtml(d.cheval.nom)} — ${escapeHtml(d.cheval.race)}, ${escapeHtml(d.cheval.robe)}<br>
          Puce : ${escapeHtml(d.cheval.puce)} · Vétérinaire : ${escapeHtml(d.cheval.veterinaire)} · Maréchal : ${escapeHtml(d.cheval.marechal)}<br>
          Vaccins — grippe : ${d.cheval.vaccinGrippeDate||'—'}, tétanos : ${d.cheval.vaccinTetanosDate||'—'}<br>
          Alimentation : ${escapeHtml(d.cheval.alimentationParticuliere||'—')}</p>` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Fermer</button>
          <button class="btn-sm primary" type="button" onclick="window.fermerModal(); window.ouvrirModalMembre(null, '${id}')">Créer la fiche membre</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
};

// ==========================================================================
// MEMBRES — CRUD
// ==========================================================================
function renderMembres(filtre = '') {
  const f = filtre.toLowerCase();
  const wrap = document.getElementById('listeMembres');
  const actifs = membresCache.filter(m => !m.archive && (!f ||
    `${m.prenom} ${m.nom} ${m.identifiant||''}`.toLowerCase().includes(f)));
  if (actifs.length === 0) {
    wrap.innerHTML = '<div class="empty-state">Aucun membre.</div>';
  } else {
    wrap.innerHTML = actifs.map(m => `
      <div class="data-row">
        <div class="data-main">
          <div class="data-title">${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</div>
          <div class="data-sub">${labelTypeMembre(m.typeMembre)} · ${escapeHtml(m.email||'')} ${m.cotisationPayee ? '<span class="badge badge-ok">Cotisation OK</span>' : '<span class="badge badge-warn">Cotisation à régler</span>'}</div>
        </div>
        <div class="data-actions">
          <button class="btn-sm" onclick="window.editerMembre('${m.id}')">Modifier</button>
          <button class="btn-sm danger" onclick="window.archiverMembre('${m.id}')">Archiver</button>
        </div>
      </div>`).join('');
  }
  renderMembresArchives();
}
function renderMembresArchives() {
  const wrap = document.getElementById('listeMembresArchives');
  const archives = membresCache.filter(m => m.archive);
  wrap.innerHTML = archives.length ? archives.map(m => `
    <div class="data-row">
      <div class="data-main"><div class="data-title">${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</div></div>
      <div class="data-actions"><button class="btn-sm" onclick="window.reactiverMembre('${m.id}')">Réactiver</button></div>
    </div>`).join('') : '<div class="empty-state">Aucun membre archivé.</div>';
}
document.getElementById('btnVoirArchives').addEventListener('click', () => {
  const z = document.getElementById('listeMembresArchives');
  z.style.display = z.style.display === 'none' ? 'flex' : 'none';
  z.style.flexDirection = 'column';
  z.style.gap = '10px';
});
document.getElementById('rechercheMembre').addEventListener('input', (e) => renderMembres(e.target.value));
document.getElementById('btnAjouterMembre').addEventListener('click', () => window.ouvrirModalMembre());

window.editerMembre = (id) => window.ouvrirModalMembre(membresParUid[id]);
window.archiverMembre = async (id) => {
  await updateDoc(doc(db, 'membres', id), { archive: true });
  await chargerMembres(); renderMembres();
};
window.reactiverMembre = async (id) => {
  await updateDoc(doc(db, 'membres', id), { archive: false });
  await chargerMembres(); renderMembres();
};

window.ouvrirModalMembre = (membre, demandeId) => {
  const d = demandeId ? window._demandesInscription[demandeId] : null;
  const src = membre || d || {};
  const estNouveau = !membre;
  const html = `
    <div class="modal-overlay" id="modalOverlayMembre">
      <div class="modal-box" style="max-width:640px;">
        <h3>${membre ? 'Modifier le membre' : 'Ajouter un membre'}</h3>
        ${estNouveau ? `<div class="banner-alert info">Le compte de connexion (identifiant + mot de passe) est créé automatiquement quand tu cliques sur "Enregistrer" — rien à faire dans Firebase.</div>` : ''}
        <div class="form-grid">
          <div class="field"><label>Identifiant de connexion *</label><input id="fm-identifiant" value="${escapeHtml(src.identifiant||src.prenom||'')}"></div>
          <div class="field"><label>Type de membre</label>
            <select id="fm-type">
              <option value="cours" ${(src.typeMembre||'cours')==='cours'?'selected':''}>Membre cours</option>
              <option value="pension" ${src.typeMembre==='pension'?'selected':''}>Membre demi-pension</option>
              <option value="benevole" ${src.typeMembre==='benevole'?'selected':''}>Membre bénévole</option>
            </select>
          </div>
        </div>
        ${estNouveau ? `<div class="form-grid">
          <div class="field"><label>Mot de passe temporaire *</label><input id="fm-motdepasse" type="text" placeholder="ex: club4460" value="club${Math.floor(1000+Math.random()*9000)}"></div>
          <div class="field"><label></label><div style="font-size:0.85rem;color:var(--terre);padding-top:8px;">À communiquer au membre — il pourra le changer une fois connecté.</div></div>
        </div>` : ''}
        <div class="form-grid">
          <div class="field"><label>Prénom *</label><input id="fm-prenom" value="${escapeHtml(src.prenom||'')}"></div>
          <div class="field"><label>Nom *</label><input id="fm-nom" value="${escapeHtml(src.nom||'')}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>Téléphone</label><input id="fm-telephone" value="${escapeHtml(src.telephone||src.gsm||'')}"></div>
          <div class="field"><label>Email</label><input id="fm-email" value="${escapeHtml(src.email||'')}"></div>
        </div>
        <div class="field"><label>Adresse</label><input id="fm-adresse" value="${escapeHtml(src.adressePostale || (src.adresse ? `${src.adresse.rue}, ${src.adresse.cp} ${src.adresse.ville}` : ''))}"></div>
        <div class="form-grid">
          <div class="field"><label>Cotisation payée</label>
            <select id="fm-cotisationPayee">
              <option value="non" ${!src.cotisationPayee?'selected':''}>Non</option>
              <option value="oui" ${src.cotisationPayee?'selected':''}>Oui</option>
            </select>
          </div>
          <div class="field"><label>Échéance cotisation</label><input type="date" id="fm-cotisationEcheance" value="${src.cotisationDateEcheance||''}"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="fm-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;

  document.getElementById('fm-save').addEventListener('click', async () => {
    const identifiant = document.getElementById('fm-identifiant').value.trim();
    const motDePasse = estNouveau ? document.getElementById('fm-motdepasse').value.trim() : '';
    if (!identifiant) { alert('L\'identifiant est obligatoire.'); return; }
    if (estNouveau && motDePasse.length < 6) { alert('Le mot de passe temporaire doit contenir au moins 6 caractères.'); return; }

    const btnSave = document.getElementById('fm-save');
    let uid;
    if (estNouveau) {
      btnSave.disabled = true;
      btnSave.textContent = 'Création du compte...';
      try {
        uid = await creerCompteMembre(identifiant, motDePasse);
      } catch (err) {
        btnSave.disabled = false;
        btnSave.textContent = 'Enregistrer';
        if (err.code === 'auth/email-already-in-use') {
          alert('Cet identifiant est déjà utilisé par un autre compte. Choisis un identifiant différent.');
        } else if (err.code === 'auth/weak-password') {
          alert('Mot de passe trop faible (6 caractères minimum).');
        } else {
          alert('Erreur lors de la création du compte : ' + (err.code || err.message));
        }
        return;
      }
      btnSave.textContent = 'Enregistrement de la fiche...';
    } else {
      uid = membre.id;
    }
    const data = {
      role: 'membre',
      identifiant,
      typeMembre: document.getElementById('fm-type').value,
      prenom: document.getElementById('fm-prenom').value.trim(),
      nom: document.getElementById('fm-nom').value.trim(),
      telephone: document.getElementById('fm-telephone').value.trim(),
      email: document.getElementById('fm-email').value.trim(),
      adressePostale: document.getElementById('fm-adresse').value.trim(),
      cotisationPayee: document.getElementById('fm-cotisationPayee').value === 'oui',
      cotisationDateEcheance: document.getElementById('fm-cotisationEcheance').value,
      archive: false
    };
    if (estNouveau) {
      data.motDePasseActuel = motDePasse;
      data.dateInscription = new Date().toISOString();
      if (d) {
        data.dateNaissance = d.dateNaissance || '';
        data.niveauEquitation = d.niveauEquitation || 'debutant';
        data.contactUrgence = d.contactUrgence || {};
        data.assuranceRC = d.assuranceRC || {};
        data.droitImage = !!d.droitImage;
        if (d.cheval && d.cheval.nom) {
          data.chevaux = [{
            id: 'cheval-' + Date.now(), nom: d.cheval.nom, race: d.cheval.race, robe: d.cheval.robe,
            naissance: d.cheval.naissance, sexe: d.cheval.sexe, puce: d.cheval.puce,
            veterinaire: d.cheval.veterinaire, marechal: d.cheval.marechal, archive: false,
            alimentationParticuliere: d.cheval.alimentationParticuliere,
            vaccins: { grippe: { date: d.cheval.vaccinGrippeDate }, tetanos: { date: d.cheval.vaccinTetanosDate } }
          }];
        }
      }
    }
    try {
      await setDoc(doc(db, 'membres', uid), data, { merge: true });
      if (demandeId) await updateDoc(doc(db, 'demandes_inscription', demandeId), { statut: 'traitee' });
      window.fermerModal();
      await chargerMembres();
      renderMembres();
      chargerDemandesInscription();
    } catch (err) {
      btnSave.disabled = false;
      btnSave.textContent = 'Enregistrer';
      alert('Erreur : ' + (err.code || err.message));
    }
  });
};

// ==========================================================================
// BOX & NETTOYAGE
// ==========================================================================
let boxesCache = [];
async function chargerBoxes() {
  const snap = await getDocs(collection(db, 'boxes'));
  boxesCache = [];
  snap.forEach(d => boxesCache.push({ id: d.id, ...d.data() }));
  renderBoxes();
}
function renderBoxes() {
  const wrap = document.getElementById('listeBoxes');
  if (boxesCache.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun box créé.</div>'; return; }
  wrap.innerHTML = boxesCache.map(b => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(b.nom)}</div>
        <div class="data-sub">${b.chevalActuel ? 'Cheval : ' + escapeHtml(b.chevalActuel) : 'Vide'} ${b.membreId ? '· Propriétaire : ' + escapeHtml(nomMembre(b.membreId)) : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerBox('${b.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerBox('${b.id}')">Supprimer</button>
      </div>
    </div>`).join('');
}
document.getElementById('btnAjouterBox').addEventListener('click', () => window.ouvrirModalBox());
window.editerBox = (id) => window.ouvrirModalBox(boxesCache.find(b => b.id === id));
window.supprimerBox = async (id) => {
  if (!confirm('Supprimer ce box ?')) return;
  await deleteDoc(doc(db, 'boxes', id));
  chargerBoxes();
};
window.ouvrirModalBox = (box) => {
  const optionsMembres = membresCache.filter(m => m.typeMembre === 'pension').map(m =>
    `<option value="${m.id}" ${box?.membreId===m.id?'selected':''}>${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</option>`).join('');
  const html = `
    <div class="modal-overlay" id="modalOverlayBox">
      <div class="modal-box">
        <h3>${box ? 'Modifier le box' : 'Ajouter un box'}</h3>
        <div class="field"><label>Nom du box</label><input id="bx-nom" value="${escapeHtml(box?.nom||'')}" placeholder="ex: Box 1"></div>
        <div class="field"><label>Cheval actuel</label><input id="bx-cheval" value="${escapeHtml(box?.chevalActuel||'')}"></div>
        <div class="field"><label>Membre en demi-pension</label>
          <select id="bx-membre"><option value="">—</option>${optionsMembres}</select>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="bx-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('bx-save').addEventListener('click', async () => {
    const data = {
      nom: document.getElementById('bx-nom').value.trim(),
      chevalActuel: document.getElementById('bx-cheval').value.trim(),
      membreId: document.getElementById('bx-membre').value || null
    };
    if (!data.nom) { alert('Merci d\'indiquer un nom de box.'); return; }
    if (box) await updateDoc(doc(db, 'boxes', box.id), data);
    else await addDoc(collection(db, 'boxes'), data);
    window.fermerModal();
    chargerBoxes();
  });
};

async function chargerNettoyages() {
  const snap = await getDocs(collection(db, 'nettoyages'));
  let taches = [];
  snap.forEach(d => taches.push({ id: d.id, ...d.data() }));
  taches.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wrap = document.getElementById('listeNettoyages');
  if (taches.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune tâche planifiée.</div>'; return; }
  wrap.innerHTML = taches.map(t => {
    const dateLabel = t.date ? capitalize(new Date(t.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'})) : '';
    const badge = t.statut === 'fait' ? '<span class="badge badge-ok">Fait</span>' : '<span class="badge badge-warn">À faire</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(t.boxNom)} — ${dateLabel}</div>
        <div class="data-sub">Assigné à : ${escapeHtml(nomMembre(t.assigneA))} ${badge}</div>
      </div>
      <div class="data-actions">
        ${t.statut !== 'fait' ? `<button class="btn-sm primary" onclick="window.marquerNettoyageFaitAdmin('${t.id}')">Marquer fait</button>` : ''}
        <button class="btn-sm danger" onclick="window.supprimerNettoyage('${t.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}
window.marquerNettoyageFaitAdmin = async (id) => { await updateDoc(doc(db, 'nettoyages', id), { statut: 'fait' }); chargerNettoyages(); };
window.supprimerNettoyage = async (id) => { await deleteDoc(doc(db, 'nettoyages', id)); chargerNettoyages(); };

document.getElementById('btnAjouterNettoyage').addEventListener('click', () => {
  const optionsBoxes = boxesCache.map(b => `<option value="${b.id}" data-nom="${escapeHtml(b.nom)}">${escapeHtml(b.nom)}</option>`).join('');
  const optionsMembres = membresCache.filter(m => m.typeMembre === 'pension').map(m => `<option value="${m.id}">${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</option>`).join('');
  const html = `
    <div class="modal-overlay" id="modalOverlayNett">
      <div class="modal-box">
        <h3>Assigner une tâche de nettoyage</h3>
        <div class="field"><label>Box</label><select id="nt-box">${optionsBoxes || '<option value="">Aucun box créé</option>'}</select></div>
        <div class="field"><label>Date</label><input type="date" id="nt-date"></div>
        <div class="field"><label>Assigné à</label><select id="nt-membre">${optionsMembres || '<option value="">Aucun membre demi-pension</option>'}</select></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="nt-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('nt-save').addEventListener('click', async () => {
    const boxSelect = document.getElementById('nt-box');
    const boxNom = boxSelect.options[boxSelect.selectedIndex]?.dataset.nom || '';
    const data = {
      boxId: boxSelect.value, boxNom,
      date: document.getElementById('nt-date').value,
      assigneA: document.getElementById('nt-membre').value,
      statut: 'a_faire', createdAt: serverTimestamp()
    };
    if (!data.date || !data.assigneA) { alert('Merci de choisir une date et un membre.'); return; }
    await addDoc(collection(db, 'nettoyages'), data);
    window.fermerModal();
    chargerNettoyages();
  });
});

// ==========================================================================
// TARIFS
// ==========================================================================
async function chargerTarifs() {
  const snap = await getDocs(collection(db, 'tarifs'));
  let tarifs = [];
  snap.forEach(d => tarifs.push({ id: d.id, ...d.data() }));
  const wrap = document.getElementById('listeTarifs');
  if (tarifs.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun tarif créé.</div>'; return; }
  const categories = [...new Set(tarifs.map(t => t.categorie || 'Autres'))];
  wrap.innerHTML = categories.map(cat => `
    <h3>${escapeHtml(cat)}</h3>
    <div class="data-list" style="margin-bottom:16px;">
      ${tarifs.filter(t => (t.categorie||'Autres')===cat).map(t => `
        <div class="data-row">
          <div class="data-main">
            <div class="data-title">${escapeHtml(t.nom)}</div>
            <div class="data-sub">${t.prixTexte || (typeof t.prix === 'number' ? t.prix.toFixed(2) + ' €' + (t.unite ? ' / ' + t.unite : '') : '')} ${t.visiblePublic === false ? '<span class="badge badge-neutral">Masqué du site public</span>' : ''}</div>
          </div>
          <div class="data-actions">
            <button class="btn-sm" onclick="window.editerTarif('${t.id}')">Modifier</button>
            <button class="btn-sm danger" onclick="window.supprimerTarif('${t.id}')">Supprimer</button>
          </div>
        </div>`).join('')}
    </div>`).join('');
  window._tarifs = {}; tarifs.forEach(t => window._tarifs[t.id] = t);
}
document.getElementById('btnAjouterTarif').addEventListener('click', () => window.ouvrirModalTarif());
window.editerTarif = (id) => window.ouvrirModalTarif(window._tarifs[id]);
window.supprimerTarif = async (id) => { if (!confirm('Supprimer ce tarif ?')) return; await deleteDoc(doc(db, 'tarifs', id)); chargerTarifs(); };
window.ouvrirModalTarif = (t) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayTarif">
      <div class="modal-box">
        <h3>${t ? 'Modifier le tarif' : 'Ajouter un tarif'}</h3>
        <div class="field"><label>Catégorie</label><input id="tf-cat" value="${escapeHtml(t?.categorie||'')}" placeholder="ex: Cours, Pension, Stages"></div>
        <div class="field"><label>Nom</label><input id="tf-nom" value="${escapeHtml(t?.nom||'')}" placeholder="ex: Cours de dressage 1h"></div>
        <div class="form-grid">
          <div class="field"><label>Prix (€)</label><input type="number" step="0.01" id="tf-prix" value="${t?.prix ?? ''}"></div>
          <div class="field"><label>Unité</label><input id="tf-unite" value="${escapeHtml(t?.unite||'')}" placeholder="ex: heure, mois"></div>
        </div>
        <div class="field"><label>Conditions (facultatif)</label><input id="tf-conditions" value="${escapeHtml(t?.conditions||'')}"></div>
        <div class="field"><label>Visible sur le site public</label>
          <select id="tf-visible"><option value="oui" ${t?.visiblePublic!==false?'selected':''}>Oui</option><option value="non" ${t?.visiblePublic===false?'selected':''}>Non</option></select>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="tf-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('tf-save').addEventListener('click', async () => {
    const prixVal = document.getElementById('tf-prix').value;
    const data = {
      categorie: document.getElementById('tf-cat').value.trim() || 'Autres',
      nom: document.getElementById('tf-nom').value.trim(),
      unite: document.getElementById('tf-unite').value.trim(),
      conditions: document.getElementById('tf-conditions').value.trim(),
      visiblePublic: document.getElementById('tf-visible').value === 'oui'
    };
    if (prixVal !== '') data.prix = parseFloat(prixVal);
    if (!data.nom) { alert('Merci d\'indiquer un nom.'); return; }
    if (t) await updateDoc(doc(db, 'tarifs', t.id), data);
    else await addDoc(collection(db, 'tarifs'), data);
    window.fermerModal();
    chargerTarifs();
  });
};

// ==========================================================================
// PARAMÈTRES BANCAIRES (IBAN)
// ==========================================================================
async function chargerIban() {
  const d = await getDoc(doc(db, 'parametres', 'bancaire'));
  document.getElementById('act-iban').value = d.exists() ? (d.data().iban || '') : '';
}
document.getElementById('btnSauverIban').addEventListener('click', async () => {
  await setDoc(doc(db, 'parametres', 'bancaire'), { iban: document.getElementById('act-iban').value.trim() }, { merge: true });
  alert('IBAN enregistré.');
});

// ==========================================================================
// MON MOT DE PASSE
// ==========================================================================
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
// DISPONIBILITÉS (horaires d'ouverture de la piste)
// ==========================================================================
const JOURS_SEMAINE = [[1,'Lundi'],[2,'Mardi'],[3,'Mercredi'],[4,'Jeudi'],[5,'Vendredi'],[6,'Samedi'],[7,'Dimanche']];

// Construit un objet { "1": {ouvert, heureDebut, heureFin}, ... "7": {...} } à
// partir des données enregistrées — supporte l'ancien format à horaire unique
// (heureDebut/heureFin/joursOuverts) pour ne rien perdre lors de la migration.
function horairesParJourDepuis(disp) {
  const horaires = {};
  const joursOuvertsAnciens = disp.joursOuverts || [1,2,3,4,5,6];
  JOURS_SEMAINE.forEach(([num]) => {
    const existant = disp.horaires && disp.horaires[num];
    if (existant) {
      horaires[num] = existant;
    } else {
      horaires[num] = {
        ouvert: joursOuvertsAnciens.includes(num),
        heureDebut: disp.heureDebut || '09:00',
        heureFin: disp.heureFin || '19:00'
      };
    }
  });
  return horaires;
}

async function chargerDisponibilitesAdmin() {
  const d = await getDoc(doc(db, 'parametres', 'disponibilites'));
  const disp = d.exists() ? d.data() : {};
  const horaires = horairesParJourDepuis(disp);
  document.getElementById('param-jours').innerHTML = JOURS_SEMAINE.map(([num, nom]) => {
    const h = horaires[num];
    return `
    <div class="horaire-jour-row" style="display:flex; align-items:center; gap:14px; padding:10px 0; border-bottom:1px solid #EEE0C4; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:8px; min-width:130px; font-weight:600;">
        <input type="checkbox" class="param-jour-check" value="${num}" ${h.ouvert ? 'checked' : ''}>
        ${nom}
      </label>
      <div class="field" style="margin:0;"><label>Ouverture</label><input type="time" class="param-jour-debut" data-jour="${num}" value="${h.heureDebut}"></div>
      <div class="field" style="margin:0;"><label>Fermeture</label><input type="time" class="param-jour-fin" data-jour="${num}" value="${h.heureFin}"></div>
    </div>`;
  }).join('');
}
document.getElementById('btnSauverDisponibilites').addEventListener('click', async () => {
  const horaires = {};
  JOURS_SEMAINE.forEach(([num]) => {
    const check = document.querySelector(`.param-jour-check[value="${num}"]`);
    const debut = document.querySelector(`.param-jour-debut[data-jour="${num}"]`);
    const fin = document.querySelector(`.param-jour-fin[data-jour="${num}"]`);
    horaires[num] = { ouvert: check.checked, heureDebut: debut.value || '09:00', heureFin: fin.value || '19:00' };
  });
  try {
    await setDoc(doc(db, 'parametres', 'disponibilites'), { horaires }, { merge: true });
    alert('Horaires enregistrés.');
  } catch (err) {
    alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message));
  }
});

// ==========================================================================
// ACTIVITÉS (stages, spectacles)
// ==========================================================================
async function chargerActivites() {
  const snap = await getDocs(collection(db, 'activites'));
  let activites = [];
  snap.forEach(d => activites.push({ id: d.id, ...d.data() }));
  activites.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wrap = document.getElementById('listeActivites');
  if (activites.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune activité créée.</div>'; return; }
  wrap.innerHTML = activites.map(a => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.titre)} <span class="badge badge-neutral">${a.type === 'stage' ? 'Stage' : 'Spectacle'}</span></div>
        <div class="data-sub">${a.date || ''} ${a.heure || ''} · ${escapeHtml(a.lieu||'')} ${a.prixParPersonne ? '· ' + Number(a.prixParPersonne).toFixed(2) + ' €/pers.' : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.voirReponsesActivite('${a.id}')">Voir réponses</button>
        <button class="btn-sm danger" onclick="window.supprimerActivite('${a.id}')">Supprimer</button>
      </div>
    </div>`).join('');
  window._activites = {}; activites.forEach(a => window._activites[a.id] = a);
}
document.getElementById('btnAjouterActivite').addEventListener('click', () => {
  const html = `
    <div class="modal-overlay" id="modalOverlayActivite">
      <div class="modal-box">
        <h3>Créer une activité</h3>
        <div class="field"><label>Titre</label><input id="ac-titre" placeholder="ex: Stage de dressage automne"></div>
        <div class="field"><label>Type</label><select id="ac-type"><option value="stage">Stage</option><option value="spectacle">Spectacle</option></select></div>
        <div class="form-grid">
          <div class="field"><label>Date</label><input type="date" id="ac-date"></div>
          <div class="field"><label>Heure</label><input type="time" id="ac-heure"></div>
        </div>
        <div class="field"><label>Lieu</label><input id="ac-lieu" value="Rue Mahay 66, Grâce-Hollogne"></div>
        <div class="field"><label>Prix par personne (€, facultatif)</label><input type="number" step="0.01" id="ac-prix"></div>
        <div class="field"><label>Description</label><textarea id="ac-description" rows="3"></textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="ac-save">Créer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ac-save').addEventListener('click', async () => {
    const data = {
      titre: document.getElementById('ac-titre').value.trim(),
      type: document.getElementById('ac-type').value,
      date: document.getElementById('ac-date').value,
      heure: document.getElementById('ac-heure').value,
      lieu: document.getElementById('ac-lieu').value.trim(),
      description: document.getElementById('ac-description').value.trim()
    };
    const prixVal = document.getElementById('ac-prix').value;
    if (prixVal !== '') data.prixParPersonne = parseFloat(prixVal);
    if (!data.titre || !data.date) { alert('Merci d\'indiquer au moins un titre et une date.'); return; }
    await addDoc(collection(db, 'activites'), data);
    window.fermerModal();
    chargerActivites();
  });
});
window.supprimerActivite = async (id) => { if (!confirm('Supprimer cette activité ?')) return; await deleteDoc(doc(db, 'activites', id)); chargerActivites(); };

window.voirReponsesActivite = async (id) => {
  const snap = await getDocs(query(collection(db, 'activites_reponses'), where('activiteId', '==', id)));
  let reponses = [];
  snap.forEach(d => reponses.push({ id: d.id, ...d.data() }));
  const html = `
    <div class="modal-overlay" id="modalOverlayReponses">
      <div class="modal-box" style="max-width:560px;">
        <h3>Réponses — ${escapeHtml(window._activites[id].titre)}</h3>
        <div class="data-list" style="max-height:50vh; overflow-y:auto;">
          ${reponses.length ? reponses.map(r => `
            <div class="data-row">
              <div class="data-main">
                <div class="data-title">${escapeHtml(nomMembre(r.uid))} — ${r.statut === 'present' ? `présent (${r.nombrePersonnes||1})` : 'absent'}</div>
                <div class="data-sub">${r.montant ? Number(r.montant).toFixed(2) + ' €' : ''} ${r.paye ? (r.paiementValide ? '<span class="badge badge-ok">Payé validé</span>' : '<span class="badge badge-warn">Payé — à valider</span>') : (r.montant ? '<span class="badge badge-danger">Non payé</span>' : '')}</div>
              </div>
              ${r.paye && !r.paiementValide ? `<div class="data-actions"><button class="btn-sm primary" onclick="window.validerPaiementActivite('${r.id}','${id}')">Valider paiement</button></div>` : ''}
            </div>`).join('') : '<div class="empty-state">Aucune réponse.</div>'}
        </div>
        <div class="modal-actions"><button class="btn-sm" type="button" onclick="window.fermerModal()">Fermer</button></div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
};
window.validerPaiementActivite = async (reponseId, activiteId) => {
  await updateDoc(doc(db, 'activites_reponses', reponseId), { paiementValide: true });
  window.voirReponsesActivite(activiteId);
};

// ==========================================================================
// BOUTIQUE
// ==========================================================================
async function chargerBoutiqueAdmin() {
  const snap = await getDocs(collection(db, 'articles_boutique'));
  let articles = [];
  snap.forEach(d => articles.push({ id: d.id, ...d.data() }));
  const wrap = document.getElementById('listeArticlesBoutique');
  wrap.innerHTML = articles.length ? articles.map(a => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.nom)} ${a.actif === false ? '<span class="badge badge-neutral">Inactif</span>' : ''}</div>
        <div class="data-sub">${Number(a.prix).toFixed(2)} € · Stock : ${a.stock ?? 0}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerArticleBoutique('${a.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerArticleBoutique('${a.id}')">Supprimer</button>
      </div>
    </div>`).join('') : '<div class="empty-state">Aucun article.</div>';
  window._articlesBoutique = {}; articles.forEach(a => window._articlesBoutique[a.id] = a);
}
document.getElementById('btnAjouterArticleBoutique').addEventListener('click', () => window.ouvrirModalArticleBoutique());
window.editerArticleBoutique = (id) => window.ouvrirModalArticleBoutique(window._articlesBoutique[id]);
window.supprimerArticleBoutique = async (id) => { if (!confirm('Supprimer cet article ?')) return; await deleteDoc(doc(db, 'articles_boutique', id)); chargerBoutiqueAdmin(); };
window.ouvrirModalArticleBoutique = (a) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayArticleBoutique">
      <div class="modal-box">
        <h3>${a ? "Modifier l'article" : 'Ajouter un article'}</h3>
        <div class="field"><label>Nom</label><input id="ab-nom" value="${escapeHtml(a?.nom||'')}"></div>
        <div class="form-grid">
          <div class="field"><label>Prix (€)</label><input type="number" step="0.01" id="ab-prix" value="${a?.prix ?? ''}"></div>
          <div class="field"><label>Stock</label><input type="number" id="ab-stock" value="${a?.stock ?? 0}"></div>
        </div>
        <div class="field"><label>Photo (URL, facultatif)</label><input id="ab-photo" value="${escapeHtml(a?.photoURL||'')}"></div>
        <div class="field"><label>Actif</label><select id="ab-actif"><option value="oui" ${a?.actif!==false?'selected':''}>Oui</option><option value="non" ${a?.actif===false?'selected':''}>Non</option></select></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="ab-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ab-save').addEventListener('click', async () => {
    const data = {
      nom: document.getElementById('ab-nom').value.trim(),
      prix: parseFloat(document.getElementById('ab-prix').value) || 0,
      stock: parseInt(document.getElementById('ab-stock').value, 10) || 0,
      photoURL: document.getElementById('ab-photo').value.trim(),
      actif: document.getElementById('ab-actif').value === 'oui'
    };
    if (!data.nom) { alert('Merci d\'indiquer un nom.'); return; }
    if (a) await updateDoc(doc(db, 'articles_boutique', a.id), data);
    else await addDoc(collection(db, 'articles_boutique'), data);
    window.fermerModal();
    chargerBoutiqueAdmin();
  });
};

async function chargerCommandesAdmin() {
  const snap = await getDocs(collection(db, 'commandes'));
  let commandes = [];
  snap.forEach(d => commandes.push({ id: d.id, ...d.data() }));
  commandes.sort((a, b) => (b.dateCreation?.toMillis?.() || 0) - (a.dateCreation?.toMillis?.() || 0));
  const wrap = document.getElementById('listeCommandes');
  wrap.innerHTML = commandes.length ? commandes.map(c => {
    const detail = (c.lignes || []).map(l => `${l.quantite} × ${escapeHtml(l.nom)}`).join(', ');
    const badge = c.statut === 'validee' ? '<span class="badge badge-ok">Validée</span>' : c.statut === 'annulee' ? '<span class="badge badge-danger">Annulée</span>' : '<span class="badge badge-warn">En attente</span>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(nomMembre(c.membreId))} — ${Number(c.total).toFixed(2)} € ${badge}</div>
        <div class="data-sub">${detail}</div>
      </div>
      ${c.statut === 'en_attente' ? `
      <div class="data-actions">
        <button class="btn-sm primary" onclick="window.validerCommande('${c.id}')">Valider</button>
        <button class="btn-sm danger" onclick="window.annulerCommande('${c.id}')">Annuler</button>
      </div>` : ''}
    </div>`;
  }).join('') : '<div class="empty-state">Aucune commande.</div>';
}
window.validerCommande = async (id) => { await updateDoc(doc(db, 'commandes', id), { statut: 'validee' }); chargerCommandesAdmin(); };
window.annulerCommande = async (id) => { await updateDoc(doc(db, 'commandes', id), { statut: 'annulee' }); chargerCommandesAdmin(); };

// ==========================================================================
// MESSAGES
// ==========================================================================
async function chargerConversations(filtre = '') {
  const snap = await getDocs(collection(db, 'conversations'));
  let convs = [];
  snap.forEach(d => convs.push({ uid: d.id, ...d.data() }));
  convs.sort((a, b) => (b.dateDernierMessage || '').localeCompare(a.dateDernierMessage || ''));
  const f = filtre.toLowerCase();
  const wrap = document.getElementById('listeConversations');
  const filtrees = convs.filter(c => !f || nomMembre(c.uid).toLowerCase().includes(f));
  wrap.innerHTML = filtrees.length ? filtrees.map(c => `
    <div class="data-row" style="cursor:pointer;" onclick="window.ouvrirConversation('${c.uid}')">
      <div class="data-main">
        <div class="data-title">${escapeHtml(nomMembre(c.uid))} ${c.nonLuAdmin ? '<span class="badge badge-warn">Nouveau</span>' : ''}</div>
        <div class="data-sub">${escapeHtml(c.dernierMessage || '')}</div>
      </div>
    </div>`).join('') : '<div class="empty-state">Aucune conversation.</div>';
}
document.getElementById('rechercheMessage').addEventListener('input', (e) => chargerConversations(e.target.value));

// ==========================================================================
// NOUVEAU MESSAGE — un membre, une sélection, ou tout le monde
// ==========================================================================
document.getElementById('btnNouveauMessage').addEventListener('click', () => window.ouvrirModalNouveauMessage());

window.ouvrirModalNouveauMessage = () => {
  const membresTries = [...membresCache].sort((a, b) => nomMembre(a.id).localeCompare(nomMembre(b.id)));
  const html = `
    <div class="modal-overlay" id="modalOverlayNouveauMsg">
      <div class="modal-box" style="max-width:520px;">
        <h3>Nouveau message</h3>
        <div class="field">
          <label>Destinataires</label>
          <select id="nm-mode">
            <option value="un">Un membre</option>
            <option value="plusieurs">Sélection de membres</option>
            <option value="tous">Tous les membres (${membresTries.length})</option>
          </select>
        </div>
        <div id="nm-zoneUnMembre" class="field">
          <label>Membre</label>
          <select id="nm-unMembre">${membresTries.map(m => `<option value="${m.id}">${escapeHtml(nomMembre(m.id))}</option>`).join('')}</select>
        </div>
        <div id="nm-zonePlusieurs" class="field hidden">
          <label>Membres</label>
          <input type="text" id="nm-filtre" placeholder="🔍 Filtrer...">
          <div style="max-height:220px; overflow-y:auto; border:1px solid #DCCBA8; border-radius:6px; padding:8px; margin-top:6px;" id="nm-listeCheckbox">
            ${membresTries.map(m => `<label class="nm-ligne" data-nom="${escapeHtml(nomMembre(m.id)).toLowerCase()}" style="display:flex; align-items:center; gap:8px; padding:4px 0;"><input type="checkbox" class="nm-check" value="${m.id}"> ${escapeHtml(nomMembre(m.id))}</label>`).join('') || '<div class="empty-state">Aucun membre.</div>'}
          </div>
        </div>
        <div id="nm-zoneTous" class="field hidden">
          <div class="banner-alert info">Le message sera envoyé individuellement à chacun des ${membresTries.length} membres.</div>
        </div>
        <div class="field"><label>Message</label><textarea id="nm-texte" rows="4" style="width:100%; box-sizing:border-box; font-family:inherit; font-size:0.95rem; padding:8px;"></textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" id="nm-envoyer">Envoyer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;

  const modeSelect = document.getElementById('nm-mode');
  const zones = { un: document.getElementById('nm-zoneUnMembre'), plusieurs: document.getElementById('nm-zonePlusieurs'), tous: document.getElementById('nm-zoneTous') };
  modeSelect.addEventListener('change', () => {
    Object.entries(zones).forEach(([k, z]) => z.classList.toggle('hidden', k !== modeSelect.value));
  });

  document.getElementById('nm-filtre').addEventListener('input', (e) => {
    const f = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#nm-listeCheckbox .nm-ligne').forEach(l => {
      l.style.display = !f || l.dataset.nom.includes(f) ? 'flex' : 'none';
    });
  });

  document.getElementById('nm-envoyer').addEventListener('click', async () => {
    const texte = document.getElementById('nm-texte').value.trim();
    if (!texte) { alert('Merci de saisir un message.'); return; }
    let uids = [];
    if (modeSelect.value === 'un') {
      const v = document.getElementById('nm-unMembre').value;
      if (v) uids = [v];
    } else if (modeSelect.value === 'plusieurs') {
      uids = [...document.querySelectorAll('.nm-check:checked')].map(c => c.value);
    } else {
      uids = membresTries.map(m => m.id);
    }
    if (uids.length === 0) { alert('Sélectionne au moins un membre.'); return; }

    const btn = document.getElementById('nm-envoyer');
    btn.disabled = true;
    btn.textContent = 'Envoi...';
    try {
      await envoyerNouveauxMessages(uids, texte);
      window.fermerModal();
      chargerConversations();
    } catch (err) {
      alert('Erreur lors de l\'envoi : ' + (err.code || err.message));
      btn.disabled = false;
      btn.textContent = 'Envoyer';
    }
  });
};

async function envoyerNouveauxMessages(uids, texte) {
  const maintenant = new Date().toISOString();
  await Promise.all(uids.map(async (uid) => {
    await addDoc(collection(db, 'conversations', uid, 'messages'), { texte, expediteur: 'admin', dateEnvoi: maintenant, lu: false });
    await setDoc(doc(db, 'conversations', uid), { dernierMessage: texte, dateDernierMessage: maintenant, nonLuMembre: true }, { merge: true });
  }));
}

window.ouvrirConversation = async (uid) => {
  const msgsSnap = await getDocs(collection(db, 'conversations', uid, 'messages'));
  let msgs = [];
  msgsSnap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
  msgs.sort((a, b) => (a.dateEnvoi || '').localeCompare(b.dateEnvoi || ''));
  const nonLus = msgs.filter(m => m.expediteur === 'membre' && !m.lu);
  await Promise.all(nonLus.map(m => updateDoc(doc(db, 'conversations', uid, 'messages', m.id), { lu: true })));
  if (nonLus.length) await setDoc(doc(db, 'conversations', uid), { nonLuAdmin: false }, { merge: true });

  const html = `
    <div class="modal-overlay" id="modalOverlayConv">
      <div class="modal-box" style="max-width:520px;">
        <h3>${escapeHtml(nomMembre(uid))}</h3>
        <div class="chat-thread" id="modalChatThread">${msgs.map(m => bulleMessage(m)).join('') || '<div class="empty-state">Aucun message.</div>'}</div>
        <div class="chat-input-row">
          <input type="text" id="modalChatInput" placeholder="Répondre...">
          <button class="btn-sm primary" id="modalChatSend">Envoyer</button>
        </div>
        <div class="modal-actions"><button class="btn-sm" type="button" onclick="window.fermerModal(); chargerConversationsGlobal();">Fermer</button></div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('modalChatThread').scrollTop = 999999;
  document.getElementById('modalChatSend').addEventListener('click', () => envoyerMessageAdmin(uid));
  document.getElementById('modalChatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerMessageAdmin(uid); });
};
window.chargerConversationsGlobal = () => chargerConversations();

async function envoyerMessageAdmin(uid) {
  const input = document.getElementById('modalChatInput');
  const texte = input.value.trim();
  if (!texte) return;
  input.value = '';
  const maintenant = new Date().toISOString();
  await addDoc(collection(db, 'conversations', uid, 'messages'), { texte, expediteur: 'admin', dateEnvoi: maintenant, lu: false });
  await setDoc(doc(db, 'conversations', uid), { dernierMessage: texte, dateDernierMessage: maintenant, nonLuMembre: true }, { merge: true });
  window.ouvrirConversation(uid);
}
function bulleMessage(m) {
  const estMoi = m.expediteur === 'admin';
  const heure = m.dateEnvoi ? new Date(m.dateEnvoi).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="chat-bubble ${estMoi ? 'moi' : 'autre'}">${escapeHtml(m.texte)}<div class="chat-meta">${heure}</div></div>`;
}

// ==========================================================================
// CHEVAUX DE L'ÉCURIE (page publique "Nos chevaux")
// ==========================================================================
async function chargerChevauxAdmin() {
  const snap = await getDocs(collection(db, 'chevaux_ecurie'));
  let chevaux = [];
  snap.forEach(d => chevaux.push({ id: d.id, ...d.data() }));
  const wrap = document.getElementById('listeChevauxEcurie');
  if (chevaux.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun cheval créé.</div>'; return; }
  wrap.innerHTML = chevaux.map(c => `
    <div class="data-row">
      ${c.photoUrl ? `<img src="${escapeHtml(c.photoUrl)}" style="width:52px; height:52px; border-radius:6px; object-fit:cover; flex:none;">` : ''}
      <div class="data-main">
        <div class="data-title">${escapeHtml(c.nom)}</div>
        <div class="data-sub">${escapeHtml(c.race || '')} ${c.visiblePublic === false ? '<span class="badge badge-neutral">Masqué du site public</span>' : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerChevalEcurie('${c.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerChevalEcurie('${c.id}')">Supprimer</button>
      </div>
    </div>`).join('');
  window._chevauxEcurie = {}; chevaux.forEach(c => window._chevauxEcurie[c.id] = c);
}
document.getElementById('btnAjouterCheval').addEventListener('click', () => window.ouvrirModalChevalEcurie());
window.editerChevalEcurie = (id) => window.ouvrirModalChevalEcurie(window._chevauxEcurie[id]);
window.supprimerChevalEcurie = async (id) => { if (!confirm('Supprimer ce cheval ?')) return; await deleteDoc(doc(db, 'chevaux_ecurie', id)); chargerChevauxAdmin(); };
window.ouvrirModalChevalEcurie = (c) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayCheval2">
      <div class="modal-box">
        <h3>${c ? 'Modifier le cheval' : 'Ajouter un cheval'}</h3>
        <div class="form-grid">
          <div class="field"><label>Nom</label><input id="ce-nom" value="${escapeHtml(c?.nom||'')}"></div>
          <div class="field"><label>Race</label><input id="ce-race" value="${escapeHtml(c?.race||'')}"></div>
        </div>
        <div class="field"><label>Photo (URL — ex: assets/chevaux/nom.jpg si déposée sur GitHub)</label><input id="ce-photo" value="${escapeHtml(c?.photoUrl||'')}"></div>
        <div class="field"><label>Description</label><textarea id="ce-description" rows="3">${escapeHtml(c?.description||'')}</textarea></div>
        <div class="field"><label>Visible sur le site public</label>
          <select id="ce-visible"><option value="oui" ${c?.visiblePublic!==false?'selected':''}>Oui</option><option value="non" ${c?.visiblePublic===false?'selected':''}>Non</option></select>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="ce-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ce-save').addEventListener('click', async () => {
    const data = {
      nom: document.getElementById('ce-nom').value.trim(),
      race: document.getElementById('ce-race').value.trim(),
      photoUrl: document.getElementById('ce-photo').value.trim(),
      description: document.getElementById('ce-description').value.trim(),
      visiblePublic: document.getElementById('ce-visible').value === 'oui'
    };
    if (!data.nom) { alert('Merci d\'indiquer un nom.'); return; }
    const btnSave = document.getElementById('ce-save');
    btnSave.disabled = true;
    try {
      if (c) await updateDoc(doc(db, 'chevaux_ecurie', c.id), data);
      else await addDoc(collection(db, 'chevaux_ecurie'), data);
      window.fermerModal();
      chargerChevauxAdmin();
    } catch (err) {
      btnSave.disabled = false;
      alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions" ou "insufficient permissions", il faut mettre à jour les règles Firestore dans la console Firebase (voir le README, section 4).');
    }
  });
};

// ==========================================================================
// ÉVÉNEMENTS (page publique, visible de tous)
// ==========================================================================
async function chargerEvenementsAdmin() {
  const snap = await getDocs(collection(db, 'evenements'));
  let evenements = [];
  snap.forEach(d => evenements.push({ id: d.id, ...d.data() }));
  evenements.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const wrap = document.getElementById('listeEvenements');
  if (evenements.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun événement créé.</div>'; return; }
  wrap.innerHTML = evenements.map(e => `
    <div class="data-row">
      ${e.photoUrl ? `<img src="${escapeHtml(e.photoUrl)}" style="width:52px; height:52px; border-radius:6px; object-fit:cover; flex:none;">` : ''}
      <div class="data-main">
        <div class="data-title">${escapeHtml(e.titre)}</div>
        <div class="data-sub">${e.date || ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerEvenement('${e.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerEvenement('${e.id}')">Supprimer</button>
      </div>
    </div>`).join('');
  window._evenements = {}; evenements.forEach(e => window._evenements[e.id] = e);
}
document.getElementById('btnAjouterEvenement').addEventListener('click', () => window.ouvrirModalEvenement());
window.editerEvenement = (id) => window.ouvrirModalEvenement(window._evenements[id]);
window.supprimerEvenement = async (id) => { if (!confirm('Supprimer cet événement ?')) return; await deleteDoc(doc(db, 'evenements', id)); chargerEvenementsAdmin(); };
window.ouvrirModalEvenement = (e) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayEvenement">
      <div class="modal-box">
        <h3>${e ? "Modifier l'événement" : 'Créer un événement'}</h3>
        <div class="field"><label>Titre</label><input id="ev-titre" value="${escapeHtml(e?.titre||'')}"></div>
        <div class="form-grid">
          <div class="field"><label>Date</label><input type="date" id="ev-date" value="${e?.date||''}"></div>
          <div class="field"><label>Heure (facultatif)</label><input type="time" id="ev-heure" value="${e?.heure||''}"></div>
        </div>
        <div class="field"><label>Photo (URL)</label><input id="ev-photo" value="${escapeHtml(e?.photoUrl||'')}"></div>
        <div class="field"><label>Description</label><textarea id="ev-description" rows="3">${escapeHtml(e?.description||'')}</textarea></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="ev-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('ev-save').addEventListener('click', async () => {
    const data = {
      titre: document.getElementById('ev-titre').value.trim(),
      date: document.getElementById('ev-date').value,
      heure: document.getElementById('ev-heure').value,
      photoUrl: document.getElementById('ev-photo').value.trim(),
      description: document.getElementById('ev-description').value.trim()
    };
    if (!data.titre || !data.date) { alert('Merci d\'indiquer au moins un titre et une date.'); return; }
    try {
      if (e) await updateDoc(doc(db, 'evenements', e.id), data);
      else await addDoc(collection(db, 'evenements'), data);
      window.fermerModal();
      chargerEvenementsAdmin();
    } catch (err) {
      alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
    }
  });
};

// ==========================================================================
// BLOG (page publique, visible de tous)
// ==========================================================================
async function chargerBlogAdmin() {
  const snap = await getDocs(collection(db, 'articles_blog'));
  let articles = [];
  snap.forEach(d => articles.push({ id: d.id, ...d.data() }));
  articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const wrap = document.getElementById('listeArticlesBlog');
  if (articles.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun article créé.</div>'; return; }
  wrap.innerHTML = articles.map(a => `
    <div class="data-row">
      ${a.photoUrl ? `<img src="${escapeHtml(a.photoUrl)}" style="width:52px; height:52px; border-radius:6px; object-fit:cover; flex:none;">` : ''}
      <div class="data-main">
        <div class="data-title">${escapeHtml(a.titre)}</div>
        <div class="data-sub">${a.date || ''} ${a.publie === false ? '<span class="badge badge-neutral">Brouillon</span>' : ''}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.editerArticleBlog('${a.id}')">Modifier</button>
        <button class="btn-sm danger" onclick="window.supprimerArticleBlog('${a.id}')">Supprimer</button>
      </div>
    </div>`).join('');
  window._articlesBlog = {}; articles.forEach(a => window._articlesBlog[a.id] = a);
}
document.getElementById('btnAjouterArticleBlog').addEventListener('click', () => window.ouvrirModalArticleBlog());
window.editerArticleBlog = (id) => window.ouvrirModalArticleBlog(window._articlesBlog[id]);
window.supprimerArticleBlog = async (id) => { if (!confirm('Supprimer cet article ?')) return; await deleteDoc(doc(db, 'articles_blog', id)); chargerBlogAdmin(); };
window.ouvrirModalArticleBlog = (a) => {
  const html = `
    <div class="modal-overlay" id="modalOverlayArticleBlog">
      <div class="modal-box" style="max-width:640px;">
        <h3>${a ? "Modifier l'article" : 'Écrire un article'}</h3>
        <div class="form-grid">
          <div class="field"><label>Titre</label><input id="bl-titre" value="${escapeHtml(a?.titre||'')}"></div>
          <div class="field"><label>Date</label><input type="date" id="bl-date" value="${a?.date || new Date().toISOString().slice(0,10)}"></div>
        </div>
        <div class="field"><label>Photo (URL, facultatif)</label><input id="bl-photo" value="${escapeHtml(a?.photoUrl||'')}"></div>
        <div class="field"><label>Contenu</label><textarea id="bl-contenu" rows="6">${escapeHtml(a?.contenu||'')}</textarea></div>
        <div class="field"><label>Statut</label>
          <select id="bl-publie"><option value="oui" ${a?.publie!==false?'selected':''}>Publié</option><option value="non" ${a?.publie===false?'selected':''}>Brouillon (pas visible du public)</option></select>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="bl-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('bl-save').addEventListener('click', async () => {
    const data = {
      titre: document.getElementById('bl-titre').value.trim(),
      date: document.getElementById('bl-date').value,
      photoUrl: document.getElementById('bl-photo').value.trim(),
      contenu: document.getElementById('bl-contenu').value.trim(),
      publie: document.getElementById('bl-publie').value === 'oui'
    };
    if (!data.titre) { alert('Merci d\'indiquer un titre.'); return; }
    try {
      if (a) await updateDoc(doc(db, 'articles_blog', a.id), data);
      else await addDoc(collection(db, 'articles_blog'), data);
      window.fermerModal();
      chargerBlogAdmin();
    } catch (err) {
      alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
    }
  });
};

// ==========================================================================
// STOCK (foin, nourriture...)
// ==========================================================================
async function chargerStockAdmin() {
  const snap = await getDocs(collection(db, 'stock'));
  let stock = [];
  snap.forEach(d => stock.push({ id: d.id, ...d.data() }));
  const wrap = document.getElementById('listeStock');
  if (stock.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun article de stock créé.</div>'; return; }
  wrap.innerHTML = stock.map(s => `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(s.nom)} ${s.quantite <= 0 ? '<span class="badge badge-danger">Épuisé</span>' : ''}</div>
        <div class="data-sub">${s.quantite} ${escapeHtml(s.unite || '')}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.ajusterStock('${s.id}', -1)">−</button>
        <button class="btn-sm" onclick="window.ajusterStock('${s.id}', 1)">+</button>
        <button class="btn-sm danger" onclick="window.supprimerStock('${s.id}')">Supprimer</button>
      </div>
    </div>`).join('');
  window._stock = {}; stock.forEach(s => window._stock[s.id] = s);
}
document.getElementById('btnAjouterStock').addEventListener('click', () => {
  const html = `
    <div class="modal-overlay" id="modalOverlayStock">
      <div class="modal-box">
        <h3>Ajouter un article de stock</h3>
        <div class="field"><label>Nom</label><input id="st-nom" placeholder="ex: Foin, Granulés, Litière..."></div>
        <div class="form-grid">
          <div class="field"><label>Quantité de départ</label><input type="number" step="0.1" id="st-quantite" value="0"></div>
          <div class="field"><label>Unité</label><input id="st-unite" placeholder="ex: bottes, kg, sacs"></div>
        </div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="st-save">Créer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('st-save').addEventListener('click', async () => {
    const nom = document.getElementById('st-nom').value.trim();
    if (!nom) { alert('Merci d\'indiquer un nom.'); return; }
    try {
      await addDoc(collection(db, 'stock'), {
        nom,
        quantite: parseFloat(document.getElementById('st-quantite').value) || 0,
        unite: document.getElementById('st-unite').value.trim()
      });
      window.fermerModal();
      chargerStockAdmin();
    } catch (err) {
      alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
    }
  });
});
window.ajusterStock = async (id, delta) => {
  const item = window._stock[id];
  if (!item) return;
  const nouvelle = Math.max(0, (item.quantite || 0) + delta);
  try {
    await updateDoc(doc(db, 'stock', id), { quantite: nouvelle });
    chargerStockAdmin();
  } catch (err) {
    alert('Erreur : ' + (err.code || err.message));
  }
};
window.supprimerStock = async (id) => { if (!confirm('Supprimer cet article de stock ?')) return; await deleteDoc(doc(db, 'stock', id)); chargerStockAdmin(); };

async function chargerStockSignalements() {
  const snap = await getDocs(collection(db, 'stock_signalements'));
  let logs = [];
  snap.forEach(d => logs.push({ id: d.id, ...d.data() }));
  logs.sort((a, b) => (b.dateSignalement || '').localeCompare(a.dateSignalement || ''));
  logs = logs.slice(0, 20);
  const wrap = document.getElementById('listeStockSignalements');
  if (logs.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune prise signalée pour l\'instant.</div>'; return; }
  wrap.innerHTML = logs.map(l => {
    const dateLabel = l.dateSignalement ? new Date(l.dateSignalement).toLocaleString('fr-BE', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(nomMembre(l.membreId))} — ${l.quantitePrise} ${escapeHtml(l.unite||'')} de ${escapeHtml(l.nom)}</div>
        <div class="data-sub">${dateLabel}</div>
      </div>
    </div>`;
  }).join('');
}

// ==========================================================================
// PLANNING BÉNÉVOLES (qui vient quand, pour quelle tâche)
// ==========================================================================
async function chargerPlanningBenevolesAdmin() {
  const snap = await getDocs(collection(db, 'planning_benevoles'));
  let creneaux = [];
  snap.forEach(d => creneaux.push({ id: d.id, ...d.data() }));
  creneaux.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.heure || '').localeCompare(b.heure || ''));
  const wrap = document.getElementById('listePlanningBenevoles');
  if (creneaux.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun créneau planifié.</div>'; return; }
  wrap.innerHTML = creneaux.map(c => {
    const dateLabel = c.date ? capitalize(new Date(c.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'})) : '';
    const badge = c.statut === 'fait' ? '<span class="badge badge-ok">Fait</span>' : '<span class="badge badge-warn">À venir</span>';
    const assigne = c.assigneA ? escapeHtml(c.assigneNom || nomMembre(c.assigneA)) : '<em>Non assigné — ouvert à tous les bénévoles</em>';
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(c.tache)} — ${dateLabel}${c.heure ? ' à ' + escapeHtml(c.heure) : ''}</div>
        <div class="data-sub">Bénévole : ${assigne} ${badge}</div>
      </div>
      <div class="data-actions">
        ${c.statut !== 'fait' ? `<button class="btn-sm primary" onclick="window.marquerPlanningBenevoleFaitAdmin('${c.id}')">Marquer fait</button>` : ''}
        <button class="btn-sm danger" onclick="window.supprimerPlanningBenevole('${c.id}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}
window.marquerPlanningBenevoleFaitAdmin = async (id) => {
  await updateDoc(doc(db, 'planning_benevoles', id), { statut: 'fait', dateRealisation: new Date().toISOString() });
  chargerPlanningBenevolesAdmin();
};
window.supprimerPlanningBenevole = async (id) => {
  if (!confirm('Supprimer ce créneau ?')) return;
  await deleteDoc(doc(db, 'planning_benevoles', id));
  chargerPlanningBenevolesAdmin();
};

document.getElementById('btnAjouterPlanningBenevole').addEventListener('click', () => {
  const optionsBenevoles = membresCache.filter(m => m.typeMembre === 'benevole').map(m => `<option value="${m.id}">${escapeHtml(m.prenom)} ${escapeHtml(m.nom)}</option>`).join('');
  const html = `
    <div class="modal-overlay" id="modalOverlayPlanningBenevole">
      <div class="modal-box">
        <h3>Ajouter un ou plusieurs créneaux bénévole</h3>
        <div class="field"><label>Bénévole</label><select id="pb-membre"><option value="">— Ouvert (n'importe quel bénévole pourra le prendre) —</option>${optionsBenevoles}</select></div>
        <div class="field"><label>Tâche</label><input id="pb-tache" placeholder="ex: Nourrissage du soir, entretien du paddock..."></div>
        <div class="form-grid">
          <div class="field"><label>Date de départ</label><input type="date" id="pb-date"></div>
          <div class="field"><label>Heure (optionnel)</label><input type="time" id="pb-heure"></div>
        </div>
        <div class="field">
          <label>Récurrence</label>
          <select id="pb-recurrence">
            <option value="aucune">Aucune — un seul créneau</option>
            <option value="hebdomadaire">Toutes les semaines</option>
            <option value="mensuelle">Tous les mois (même jour du mois)</option>
          </select>
        </div>
        <div class="field hidden" id="pb-zoneJusquau"><label>Jusqu'au (inclus)</label><input type="date" id="pb-jusquau"></div>
        <div class="modal-actions">
          <button class="btn-sm" type="button" onclick="window.fermerModal()">Annuler</button>
          <button class="btn-sm primary" type="button" id="pb-save">Enregistrer</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalZone').innerHTML = html;
  document.getElementById('pb-recurrence').addEventListener('change', (e) => {
    document.getElementById('pb-zoneJusquau').classList.toggle('hidden', e.target.value === 'aucune');
  });
  document.getElementById('pb-save').addEventListener('click', async () => {
    const membreSelect = document.getElementById('pb-membre');
    const membre = membresCache.find(m => m.id === membreSelect.value);
    const tache = document.getElementById('pb-tache').value.trim();
    const dateVal = document.getElementById('pb-date').value;
    const heure = document.getElementById('pb-heure').value;
    const recurrence = document.getElementById('pb-recurrence').value;
    const jusquau = document.getElementById('pb-jusquau').value;
    if (!tache || !dateVal) { alert('Merci de renseigner au moins une tâche et une date.'); return; }
    if (recurrence !== 'aucune' && !jusquau) { alert('Merci d\'indiquer une date de fin pour la récurrence.'); return; }

    // Calcule la liste des dates à créer (une seule si pas de récurrence).
    const dates = [dateVal];
    if (recurrence !== 'aucune') {
      let courante = new Date(dateVal + 'T00:00:00');
      const fin = new Date(jusquau + 'T00:00:00');
      while (true) {
        if (recurrence === 'hebdomadaire') courante.setDate(courante.getDate() + 7);
        else courante.setMonth(courante.getMonth() + 1);
        if (courante > fin) break;
        dates.push(dateISOLocale(courante));
        if (dates.length >= 104) break; // garde-fou (2 ans hebdo max)
      }
    }

    try {
      await Promise.all(dates.map(d => addDoc(collection(db, 'planning_benevoles'), {
        assigneA: membreSelect.value || null,
        assigneNom: membre ? `${membre.prenom} ${membre.nom}` : '',
        tache,
        date: d,
        heure,
        statut: 'a_faire',
        createdAt: serverTimestamp()
      })));
      window.fermerModal();
      chargerPlanningBenevolesAdmin();
    } catch (err) {
      alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
    }
  });
});

// ==========================================================================
// CONTENU DU SITE (textes des pages publiques)
// ==========================================================================
async function chargerContenuAdmin() {
  const d = await getDoc(doc(db, 'contenu_site', 'global'));
  const c = d.exists() ? d.data() : {};
  document.getElementById('ct-heroTitre').value = c.heroTitre || '';
  document.getElementById('ct-heroTexte').value = c.heroTexte || '';
  document.getElementById('ct-clubIntro').value = c.clubIntro || '';
  document.getElementById('ct-clubOffre').value = c.clubOffre || '';
  document.getElementById('ct-laraBio').value = c.laraBio || '';
}
document.getElementById('btnSauverContenu').addEventListener('click', async () => {
  try {
    await setDoc(doc(db, 'contenu_site', 'global'), {
      heroTitre: document.getElementById('ct-heroTitre').value.trim(),
      heroTexte: document.getElementById('ct-heroTexte').value.trim(),
      clubIntro: document.getElementById('ct-clubIntro').value.trim(),
      clubOffre: document.getElementById('ct-clubOffre').value.trim(),
      laraBio: document.getElementById('ct-laraBio').value.trim()
    }, { merge: true });
    alert('Textes enregistrés. Ils apparaîtront sur le site public au prochain chargement des pages.');
  } catch (err) {
    alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
  }
});

// ==========================================================================
// CALENDRIER — jours fermés / horaires exceptionnels
// ==========================================================================
document.getElementById('exc-statut').addEventListener('change', (e) => {
  document.getElementById('exc-horaireZone').style.display = e.target.value === 'horaire' ? 'grid' : 'none';
});
document.getElementById('btnAjouterException').addEventListener('click', async () => {
  const dateISO = document.getElementById('exc-date').value;
  if (!dateISO) { alert('Merci de choisir une date.'); return; }
  const statut = document.getElementById('exc-statut').value;
  const data = statut === 'ferme'
    ? { ferme: true }
    : {
        ferme: false,
        heureDebut: document.getElementById('exc-heureDebut').value,
        heureFin: document.getElementById('exc-heureFin').value
      };
  if (statut === 'horaire' && (!data.heureDebut || !data.heureFin)) {
    alert('Merci d\'indiquer une heure d\'ouverture et de fermeture.');
    return;
  }
  try {
    await setDoc(doc(db, 'disponibilites_exceptions', dateISO), data);
    document.getElementById('exc-date').value = '';
    chargerExceptionsAdmin();
  } catch (err) {
    alert('Erreur lors de l\'enregistrement : ' + (err.code || err.message) + '\n\nSi le message mentionne "permissions", il faut mettre à jour les règles Firestore (voir le README, section 4).');
  }
});
async function chargerExceptionsAdmin() {
  const snap = await getDocs(collection(db, 'disponibilites_exceptions'));
  let exceptions = [];
  snap.forEach(d => exceptions.push({ date: d.id, ...d.data() }));
  exceptions = exceptions.filter(e => e.date >= dateISOLocale(new Date()));
  exceptions.sort((a, b) => a.date.localeCompare(b.date));
  const wrap = document.getElementById('listeExceptions');
  if (exceptions.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune exception à venir.</div>'; return; }
  wrap.innerHTML = exceptions.map(e => {
    const dateLabel = capitalize(new Date(e.date + 'T00:00:00').toLocaleDateString('fr-BE', {weekday:'long', day:'numeric', month:'long'}));
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${dateLabel}</div>
        <div class="data-sub">${e.ferme ? '<span class="badge badge-danger">Fermé</span>' : `<span class="badge badge-neutral">Horaire spécial : ${e.heureDebut} – ${e.heureFin}</span>`}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm danger" onclick="window.supprimerException('${e.date}')">Supprimer</button>
      </div>
    </div>`;
  }).join('');
}
window.supprimerException = async (dateISO) => {
  await deleteDoc(doc(db, 'disponibilites_exceptions', dateISO));
  chargerExceptionsAdmin();
};

// ==========================================================================
// MOTS DE PASSE (super-admin uniquement)
// ==========================================================================
async function chargerMotsDePasseAdmin() {
  const snap = await getDocs(collection(db, 'membres'));
  let comptes = [];
  snap.forEach(d => comptes.push({ id: d.id, ...d.data() }));
  comptes.sort((a, b) => {
    const ordre = { superadmin: 0, admin: 1 };
    const oa = ordre[a.role] ?? 2, ob = ordre[b.role] ?? 2;
    if (oa !== ob) return oa - ob;
    return (a.identifiant || '').localeCompare(b.identifiant || '');
  });
  renderMotsDePasse(comptes);
}
function labelRoleCompte(role) {
  if (role === 'superadmin') return '<span class="badge badge-danger">Super-admin</span>';
  if (role === 'admin') return '<span class="badge badge-warn">Admin</span>';
  return '<span class="badge badge-neutral">Membre</span>';
}
function formatDateHeure(ts) {
  if (!ts?.seconds) return 'jamais';
  return new Date(ts.seconds * 1000).toLocaleString('fr-BE', { dateStyle: 'medium', timeStyle: 'short' });
}
function renderMotsDePasse(comptes) {
  const wrap = document.getElementById('listeMotsDePasse');
  if (comptes.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucun compte.</div>'; return; }
  wrap.innerHTML = comptes.map(c => {
    const nomComplet = `${c.prenom || ''} ${c.nom || ''}`.trim();
    const mdp = c.motDePasseActuel;
    return `
    <div class="data-row">
      <div class="data-main">
        <div class="data-title">${escapeHtml(c.identifiant || c.id)} ${labelRoleCompte(c.role)}</div>
        <div class="data-sub">${escapeHtml(nomComplet)}</div>
        <div class="data-sub" style="margin-top:4px;">
          Mot de passe actuel : ${mdp ? `<code>${escapeHtml(mdp)}</code>` : '<em>non enregistré (compte créé avant cette fonctionnalité — à renseigner via une réinitialisation)</em>'}
        </div>
        <div class="data-sub">Dernière connexion : ${formatDateHeure(c.derniereConnexion)}</div>
      </div>
      <div class="data-actions">
        <button class="btn-sm" onclick="window.reinitialiserMotDePasse('${c.id}','${escapeHtml(c.identifiant || '')}')">Réinitialiser</button>
      </div>
    </div>`;
  }).join('');
}
window.reinitialiserMotDePasse = async (uid, identifiant) => {
  const compte = membresParUid[uid] || {};
  const ancienConnu = compte.motDePasseActuel;
  let ancien = ancienConnu;
  if (!ancien) {
    ancien = prompt(`Le mot de passe actuel de "${identifiant}" n'est pas encore enregistré.\nSaisis le mot de passe actuellement en vigueur pour ce compte (nécessaire pour le changer) :`);
    if (!ancien) return;
  }
  const nouveau = prompt(`Nouveau mot de passe pour "${identifiant}" (6 caractères minimum) :`);
  if (!nouveau) return;
  if (nouveau.length < 6) { alert('Le nouveau mot de passe doit contenir au moins 6 caractères.'); return; }
  try {
    await reinitialiserMotDePasseCompte(identifiant, ancien, nouveau);
    await updateDoc(doc(db, 'membres', uid), { motDePasseActuel: nouveau });
    alert(`Mot de passe de "${identifiant}" réinitialisé.`);
    await chargerMembres();
    chargerMotsDePasseAdmin();
  } catch (err) {
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
      alert('Le mot de passe actuel saisi est incorrect — réinitialisation annulée.');
    } else {
      alert('Erreur lors de la réinitialisation : ' + (err.code || err.message));
    }
  }
};

async function chargerSauvegardesMdp() {
  const snap = await getDocs(collection(db, 'sauvegardes_mdp'));
  let sauvegardes = [];
  snap.forEach(d => sauvegardes.push({ id: d.id, ...d.data() }));
  sauvegardes.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
  sauvegardes = sauvegardes.slice(0, 20);
  const wrap = document.getElementById('listeSauvegardesMdp');
  if (sauvegardes.length === 0) { wrap.innerHTML = '<div class="empty-state">Aucune sauvegarde pour l\'instant — la première sera créée à la prochaine connexion du super-admin.</div>'; return; }
  wrap.innerHTML = sauvegardes.map(s => {
    const dateLabel = s.date?.seconds
      ? new Date(s.date.seconds * 1000).toLocaleString('fr-BE', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Date inconnue';
    const detailId = 'sauv-' + s.id;
    const comptesHtml = (s.comptes || []).map(c =>
      `<div class="data-sub">${escapeHtml(c.identifiant)} (${c.role}) : ${c.motDePasseActuel ? `<code>${escapeHtml(c.motDePasseActuel)}</code>` : '<em>non enregistré</em>'}</div>`
    ).join('');
    return `
    <div class="data-row" style="flex-direction:column; align-items:stretch;">
      <div class="data-main" style="cursor:pointer;" onclick="document.getElementById('${detailId}').classList.toggle('hidden')">
        <div class="data-title">${dateLabel}</div>
        <div class="data-sub">${(s.comptes || []).length} compte(s) — clique pour afficher le détail</div>
      </div>
      <div id="${detailId}" class="hidden" style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(0,0,0,0.08);">${comptesHtml}</div>
    </div>`;
  }).join('');
}
