// Projet : Larallegria — Version V01-049
// Protection légère du contenu du site — © Hélène Laruelle.
// Dissuasive uniquement : quiconque maîtrise les outils développeur peut la
// contourner, mais elle décourage la copie occasionnelle du texte, des
// photos et du code source par un visiteur lambda.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});

// Anti-clickjacking : refuse de s'afficher à l'intérieur d'une autre page
// (GitHub Pages ne permet pas d'envoyer l'en-tête X-Frame-Options).
if (window.top !== window.self) {
  try { window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; }
}
