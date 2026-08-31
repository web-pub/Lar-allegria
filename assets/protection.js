// Protection légère du contenu du site — © Hélène Laruelle.
// Dissuasive uniquement : quiconque maîtrise les outils développeur peut la
// contourner, mais elle décourage la copie occasionnelle du texte, des
// photos et du code source par un visiteur lambda.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => {
  if (e.target.tagName === 'IMG') e.preventDefault();
});
