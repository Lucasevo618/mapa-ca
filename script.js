(function () {
  'use strict';

  // Coordenadas aproximadas do centro de cada bairro. Contagens fictícias.
  const DISTRICTS = [
    { name: 'Centro', lat: -25.5440, lng: -54.5860, reports: 31 },
    { name: 'Vila Portes', lat: -25.5195, lng: -54.5930, reports: 27 },
    { name: 'Porto Meira', lat: -25.5830, lng: -54.5720, reports: 25 },
    { name: 'Jardim América', lat: -25.5590, lng: -54.5660, reports: 21 },
    { name: 'Morumbi', lat: -25.4995, lng: -54.5430, reports: 17 },
    { name: 'Cidade Nova', lat: -25.4960, lng: -54.5610, reports: 15 },
    { name: 'Vila A', lat: -25.5140, lng: -54.5690, reports: 14 },
    { name: 'KLP', lat: -25.5720, lng: -54.5530, reports: 13 },
    { name: 'Jupira', lat: -25.5300, lng: -54.5790, reports: 12 },
    { name: 'Três Lagoas', lat: -25.5120, lng: -54.5180, reports: 11 },
    { name: 'Carimã', lat: -25.5640, lng: -54.5260, reports: 8 },
    { name: 'Vila Yolanda', lat: -25.5435, lng: -54.5640, reports: 6 },
    { name: 'Maracanã', lat: -25.5490, lng: -54.5420, reports: 5 },
    { name: 'Campos do Iguaçu', lat: -25.5030, lng: -54.5800, reports: 3 },
  ];

  // Áreas com baixíssimo índice de denúncias e boa rede de apoio (fictício).
  const SAFE_ZONES = [
    { name: 'Jardim Califórnia', lat: -25.5265, lng: -54.5425, size: 1 },
    { name: 'Parque Monjolo', lat: -25.5395, lng: -54.5205, size: 0.9 },
    { name: 'Jardim Petrópolis', lat: -25.5610, lng: -54.5900, size: 0.8 },
    { name: 'Vila Shalon', lat: -25.5860, lng: -54.5430, size: 0.9 },
    { name: 'Lagoa Dourada', lat: -25.5290, lng: -54.5060, size: 0.8 },
    { name: 'Jardim São Paulo', lat: -25.4840, lng: -54.5580, size: 0.85 },
    { name: 'Parque Imperatriz', lat: -25.5520, lng: -54.5520, size: 0.7 },
  ];

  const MAP_CENTER = [-25.5478, -54.5682];
  const MAP_ZOOM = 12.75;
  const METERS_PER_DEG_LAT = 111320;

  function riskLevel(count) {
    if (count >= 20) return { key: 'alto', label: 'Risco alto' };
    if (count >= 10) return { key: 'medio', label: 'Risco médio' };
    return { key: 'baixo', label: 'Risco baixo' };
  }

  // PRNG com semente fixa para que as manchas sejam sempre iguais.
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const random = mulberry32(20241);
  const triangular = () => random() - random();

  const maxReports = Math.max(...DISTRICTS.map((d) => d.reports));

  function spreadMeters(district) {
    return 300 + (district.reports / maxReports) * 400;
  }

  function scatter(lat, lng, count, spread, intensity) {
    const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    const points = [];
    for (let i = 0; i < count; i++) {
      const dLat = (triangular() * spread) / METERS_PER_DEG_LAT;
      const dLng = (triangular() * spread) / metersPerDegLng;
      points.push([lat + dLat, lng + dLng, intensity]);
    }
    return points;
  }

  function generateReports(district) {
    const intensity = 0.028 + 0.034 * (district.reports / maxReports);
    return scatter(district.lat, district.lng, district.reports, spreadMeters(district), intensity);
  }

  function safeSpreadMeters(zone) {
    return 350 + zone.size * 300;
  }

  function generateSafePoints(zone) {
    return scatter(zone.lat, zone.lng, 24, safeSpreadMeters(zone), 0.06);
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }

  const map = L.map('map', {
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    scrollWheelZoom: false,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  setTimeout(() => map.invalidateSize(), 150);

  const heatPoints = DISTRICTS.flatMap(generateReports);
  const safePoints = SAFE_ZONES.flatMap(generateSafePoints);

  if (typeof L.heatLayer === 'function') {
    L.heatLayer(safePoints, {
      radius: 44,
      blur: 36,
      max: 1,
      maxZoom: MAP_ZOOM,
      minOpacity: 0.3,
      gradient: { 0: '#1d6b34', 0.5: '#2f9a4c', 1: '#5fd37a' },
    }).addTo(map);

    L.heatLayer(heatPoints, {
      radius: 42,
      blur: 34,
      max: 1,
      maxZoom: MAP_ZOOM,
      minOpacity: 0.35,
      gradient: { 0: '#d8c445', 0.5: '#e0862f', 1: '#d43a3a' },
    }).addTo(map);
  } else {
    console.error('[Mapa de calor] O plugin leaflet.heat não foi carregado. Verifique o CDN do jsDelivr.');
  }

  const zoneCircles = new Map();

  function addHitArea(key, lat, lng, radius, popupHtml) {
    const circle = L.circle([lat, lng], {
      radius,
      stroke: false,
      fill: true,
      fillOpacity: 0,
    }).addTo(map);
    circle.bindPopup(popupHtml);
    zoneCircles.set(key, circle);
  }

  DISTRICTS.forEach((district) => {
    const level = riskLevel(district.reports);
    addHitArea(
      `d:${district.name}`,
      district.lat,
      district.lng,
      spreadMeters(district) * 0.9,
      `<strong>${escapeHtml(district.name)}</strong><br>` +
        `${district.reports} denúncias<br>` +
        `<span class="popup-risk"><span class="level-dot level-${level.key}"></span>${level.label}</span>`
    );
  });

  SAFE_ZONES.forEach((zone) => {
    addHitArea(
      `s:${zone.name}`,
      zone.lat,
      zone.lng,
      safeSpreadMeters(zone) * 0.9,
      `<strong>${escapeHtml(zone.name)}</strong><br>` +
        'Nenhuma denúncia registrada<br>' +
        '<span class="popup-risk"><span class="level-dot level-seguro"></span>Zona segura</span>'
    );
  });

  function focusZone(key, lat, lng) {
    map.setView([lat, lng], 14);
    zoneCircles.get(key).openPopup();
  }

  function createZoneButton({ key, lat, lng, levelKey, name, meta, ariaLabel }) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', ariaLabel);
    button.innerHTML =
      `<span class="level-dot level-${levelKey}" aria-hidden="true"></span>` +
      `<span class="district-name">${escapeHtml(name)}</span>` +
      `<span class="district-count">${escapeHtml(meta)}</span>`;
    button.addEventListener('click', () => focusZone(key, lat, lng));
    li.appendChild(button);
    return li;
  }

  document.getElementById('total-reports').textContent = heatPoints.length;
  document.getElementById('total-safe').textContent = SAFE_ZONES.length;

  const districtList = document.getElementById('district-list');
  [...DISTRICTS]
    .sort((a, b) => b.reports - a.reports)
    .forEach((district) => {
      const level = riskLevel(district.reports);
      districtList.appendChild(
        createZoneButton({
          key: `d:${district.name}`,
          lat: district.lat,
          lng: district.lng,
          levelKey: level.key,
          name: district.name,
          meta: String(district.reports),
          ariaLabel: `${district.name}: ${district.reports} denúncias, ${level.label}. Ver no mapa.`,
        })
      );
    });

  const safeList = document.getElementById('safe-list');
  SAFE_ZONES.forEach((zone) => {
    safeList.appendChild(
      createZoneButton({
        key: `s:${zone.name}`,
        lat: zone.lat,
        lng: zone.lng,
        levelKey: 'seguro',
        name: zone.name,
        meta: '0',
        ariaLabel: `${zone.name}: zona segura, nenhuma denúncia. Ver no mapa.`,
      })
    );
  });
})();
