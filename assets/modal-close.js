// Fenêtres (fiches, formulaires) : croix de fermeture en haut à droite +
// avertissement si des modifications n'ont pas été enregistrées.
// Fonctionne pour toute fenêtre ".modal-overlay" ajoutée à la page.
(function () {
  function fermer(overlay) {
    if (typeof window.fermerModal === 'function' && overlay.parentElement && overlay.parentElement.id === 'modalZone') window.fermerModal();
    else overlay.remove();
  }
  function demanderFermeture(overlay) {
    if (overlay.dataset.dirty === '1' && !window.confirm("Vous avez des modifications non enregistrées.\n\nFermer quand même ? (elles seront perdues)")) return;
    fermer(overlay);
  }
  // Le contrat à signer est obligatoire : jamais fermable sans signature.
  function protegee(overlay) { return overlay.id === 'overlayAccordCollaboration' || overlay.hasAttribute('data-noclose'); }
  function equiper(overlay) {
    if (overlay.dataset.equipee || protegee(overlay)) return;
    overlay.dataset.equipee = '1';
    var box = overlay.querySelector('.modal-box');
    if (!box) return;
    var croix = document.createElement('button');
    croix.type = 'button';
    croix.className = 'modal-close-x';
    croix.setAttribute('aria-label', 'Fermer');
    croix.textContent = '✕';
    croix.addEventListener('click', function () { demanderFermeture(overlay); });
    box.insertBefore(croix, box.firstChild);
    // Suivi des modifications (le formulaire est "sale" dès qu'un champ change).
    var marquer = function (e) { if (e.target.closest && e.target.closest('.modal-box') && e.target.matches('input, select, textarea')) overlay.dataset.dirty = '1'; };
    overlay.addEventListener('input', marquer);
    overlay.addEventListener('change', marquer);
    // Clic en dehors de la fenêtre = même comportement que la croix.
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) demanderFermeture(overlay); });
  }
  function scanner(racine) {
    (racine.querySelectorAll ? racine.querySelectorAll('.modal-overlay') : []).forEach(equiper);
    if (racine.classList && racine.classList.contains('modal-overlay')) equiper(racine);
  }
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scanner(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var ov = Array.prototype.filter.call(document.querySelectorAll('.modal-overlay'), function (o) { return !protegee(o); });
    if (ov.length) demanderFermeture(ov[ov.length - 1]);
  });
  scanner(document);
})();
