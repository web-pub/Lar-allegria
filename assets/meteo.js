// ==========================================================================
// Météo — Grâce-Hollogne (4460), via Open-Meteo (gratuit, sans clé)
// ==========================================================================

const LAT = 50.6425;
const LON = 5.4756;

let cachePromise = null;
let cacheAt = 0;

function chargerMeteo() {
  const maintenant = Date.now();
  // On revalide toutes les 55 minutes (les prévisions horaires n'ont pas
  // besoin d'être rafraîchies plus souvent que ça).
  if (!cachePromise || (maintenant - cacheAt) > 55 * 60 * 1000) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,precipitation_probability,windspeed_10m,weathercode&current=temperature_2m,weathercode&timezone=Europe%2FBrussels&forecast_days=16`;
    cacheAt = maintenant;
    cachePromise = fetch(url).then(r => r.json()).catch(() => null);
  }
  return cachePromise;
}

export async function meteoActuelle() {
  const data = await chargerMeteo();
  if (!data || !data.current) return null;
  return {
    temperature: Math.round(data.current.temperature_2m),
    description: descriptionCode(data.current.weathercode),
    code: data.current.weathercode
  };
}

// dateISO: "2026-08-10", heureHHMM: "18:00"
export async function meteoPour(dateISO, heureHHMM) {
  const data = await chargerMeteo();
  if (!data || !data.hourly) return null;
  const heure = heureHHMM.slice(0, 2);
  const idx = data.hourly.time.findIndex(t => t.startsWith(dateISO) && t.slice(11, 13) === heure);
  if (idx === -1) return null;
  return {
    temperature: Math.round(data.hourly.temperature_2m[idx]),
    pluie: data.hourly.precipitation_probability[idx],
    vent: Math.round(data.hourly.windspeed_10m[idx]),
    code: data.hourly.weathercode[idx],
    description: descriptionCode(data.hourly.weathercode[idx])
  };
}

// Calcule une couleur allant d'un ton chaud modéré vers le rouge d'alerte,
// proportionnellement à l'intensité du risque (0 = seuil d'alerte tout
// juste atteint, 1 = risque maximal).
function couleurRisque(intensite) {
  const t = Math.max(0, Math.min(1, intensite));
  const debut = [201, 138, 58];   // ocre chaud
  const fin = [138, 46, 46];      // rouge alerte (identique au reste du site)
  const rgb = debut.map((c, i) => Math.round(c + (fin[i] - c) * t));
  return `rgb(${rgb.join(',')})`;
}

// Un cours/une réservation en extérieur mérite une alerte au-delà de ces
// seuils. Le texte reste générique (pas de pourcentage/degré affiché) et
// c'est la couleur qui monte vers le rouge selon l'intensité du risque.
export function alerteMeteo(m) {
  if (!m) return null;
  const risques = [];
  if (typeof m.pluie === 'number' && m.pluie >= 40) {
    risques.push({ intensite: Math.min(1, (m.pluie - 40) / 60), texte: 'Pluie possible' });
  }
  if (typeof m.vent === 'number' && m.vent >= 30) {
    risques.push({ intensite: Math.min(1, (m.vent - 30) / 30), texte: 'Vent fort possible' });
  }
  if (typeof m.temperature === 'number' && m.temperature >= 28) {
    risques.push({ intensite: Math.min(1, (m.temperature - 28) / 10), texte: 'Forte chaleur possible' });
  }
  if (typeof m.temperature === 'number' && m.temperature <= -2) {
    risques.push({ intensite: Math.min(1, (-2 - m.temperature) / 8), texte: 'Risque de gel' });
  }
  if (risques.length === 0) return null;
  risques.sort((a, b) => b.intensite - a.intensite);
  const pire = risques[0];
  return { niveau: pire.intensite >= 0.5 ? 'danger' : 'warn', texte: pire.texte, couleur: couleurRisque(pire.intensite) };
}

function descriptionCode(code) {
  const map = {
    0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert',
    45: 'Brouillard', 48: 'Brouillard givrant',
    51: 'Bruine légère', 53: 'Bruine', 55: 'Bruine forte',
    61: 'Pluie légère', 63: 'Pluie', 65: 'Pluie forte',
    71: 'Neige légère', 73: 'Neige', 75: 'Neige forte',
    80: 'Averses', 81: 'Averses fortes', 82: 'Averses violentes',
    95: 'Orage', 96: 'Orage avec grêle', 99: 'Orage violent'
  };
  return map[code] || 'Météo';
}

export function iconeCode(code) {
  if (code === 0 || code === 1) return '☀️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return '🌧️';
  if ([71, 73, 75].includes(code)) return '❄️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '🌡️';
}
