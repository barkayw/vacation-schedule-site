import * as render from './render.js';
import * as weather from './weather.js';

const SESSION_KEY = 'vss_auth';

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unlock() {
  document.getElementById('password-screen').style.display = 'none';
  document.getElementById('main-site').style.display = 'block';
  setTimeout(initMap, 100);
}

async function setupPasswordGate() {
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    unlock();
    return;
  }
  const form = document.getElementById('password-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('password-input');
    const err = document.getElementById('password-error');
    const hash = await sha256Hex(input.value);
    if (hash === window.__SITE_PASSWORD_HASH__) {
      sessionStorage.setItem(SESSION_KEY, '1');
      unlock();
    } else {
      err.style.display = 'block';
      input.value = '';
      err.style.animation = 'none';
      void err.offsetHeight;
      err.style.animation = '';
    }
  });
}

// ---------------------------------------------------------------------
// Accordion (same behavior/timing notes as the original hand-written site)
// ---------------------------------------------------------------------

function afterTransition(el, callback) {
  if (!el) { callback(); return; }
  let done = false;
  const finish = () => { if (done) return; done = true; callback(); };
  const onEnd = (e) => {
    if (e.target !== el || e.propertyName !== 'max-height') return;
    el.removeEventListener('transitionend', onEnd);
    finish();
  };
  el.addEventListener('transitionend', onEnd);
  setTimeout(finish, 650);
}

function openPhase(phaseSection, callback) {
  const header = phaseSection.querySelector('.phase-header');
  const content = phaseSection.querySelector('.phase-content');
  const alreadyOnlyOpen = content.classList.contains('open') &&
    document.querySelectorAll('.phase-content.open').length === 1;

  document.querySelectorAll('.phase-content').forEach((c) => c.classList.remove('open'));
  document.querySelectorAll('.phase-header').forEach((h) => {
    h.classList.remove('open');
    const btn = h.querySelector('.phase-toggle-btn');
    if (btn) btn.innerHTML = 'Show Itinerary ▾';
  });
  content.classList.add('open');
  header.classList.add('open');
  const btn = header.querySelector('.phase-toggle-btn');
  if (btn) btn.innerHTML = 'Hide Itinerary ▴';

  afterTransition(alreadyOnlyOpen ? null : content, callback || (() => {}));
}

function togglePhase(header) {
  const phaseSection = header.closest('.phase-section');
  const content = header.nextElementSibling;
  const isOpen = content.classList.contains('open');

  if (isOpen) {
    content.classList.remove('open');
    header.classList.remove('open');
    const btn = header.querySelector('.phase-toggle-btn');
    if (btn) btn.innerHTML = 'Show Itinerary ▾';
    return;
  }

  openPhase(phaseSection, () => {
    header.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function wireInteractivity() {
  document.querySelectorAll('.phase-header').forEach((header) => {
    header.addEventListener('click', () => togglePhase(header));
  });

  document.querySelectorAll('.dest-card[data-phase]').forEach((card) => {
    card.addEventListener('click', (e) => {
      e.preventDefault();
      const phase = document.getElementById(card.getAttribute('data-phase'));
      if (!phase) return;
      openPhase(phase, () => phase.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });
  });

  document.querySelectorAll('nav a, a.ctx-link[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (!target) return;

      const highlight = () => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.style.transition = 'box-shadow .3s';
        target.style.boxShadow = '0 0 0 3px var(--color-accent)';
        setTimeout(() => { target.style.boxShadow = ''; }, 1500);
      };

      const collapsedContent = target.closest('.phase-content:not(.open)');
      const collapsedSection = collapsedContent && collapsedContent.closest('.phase-section');
      if (collapsedSection) {
        openPhase(collapsedSection, highlight);
      } else {
        highlight();
      }
    });
  });

  const sections = document.querySelectorAll('section[id], .phase-section[id], .journey-section[id]');
  const navLinks = document.querySelectorAll('nav a');
  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach((section) => {
      const top = section.offsetTop - 100;
      if (window.pageYOffset >= top) current = section.getAttribute('id');
    });
    navLinks.forEach((link) => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) link.classList.add('active');
    });
  });
}

// ---------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------

let trip;

function countdownTarget() {
  if (trip.meta.countdownTarget) return new Date(trip.meta.countdownTarget);
  const outbound = (trip.flights || []).find((f) => f.direction === 'outbound');
  if (outbound) return new Date(`${outbound.date}T00:00:00`);
  return new Date(`${trip.meta.startDate}T00:00:00`);
}

function updateCountdown() {
  const departure = countdownTarget();
  const diff = departure - new Date();
  if (diff <= 0) {
    document.getElementById('countdown').innerHTML =
      '<div class="countdown-unit"><div class="num">🎉</div><div class="lbl">Bon Voyage!</div></div>';
    return;
  }
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((diff % (1000 * 60)) / 1000);
  document.getElementById('cd-days').textContent = d;
  document.getElementById('cd-hours').textContent = h;
  document.getElementById('cd-mins').textContent = m;
  document.getElementById('cd-secs').textContent = s;
}

// ---------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------

async function initMap() {
  const mapEl = document.getElementById('trip-map');
  if (!mapEl || mapEl._leaflet_id) return;
  const destinations = trip.destinations.filter((d) => d.coordinates);
  if (!destinations.length) {
    document.getElementById('map').style.display = 'none';
    return;
  }

  // Build the full ordered list of points along the route: each destination,
  // with any en-route stops (venues with coordinates on that leg's arrival day,
  // e.g. a coffee farm on a drive day) inserted just before it. Stops inherit
  // the color of the destination they lead into.
  const points = [{
    name: destinations[0].name,
    icon: destinations[0].emoji || '📍',
    desc: destinations[0].mapDescription || '',
    lat: destinations[0].coordinates.lat,
    lng: destinations[0].coordinates.lng,
    color: PALETTE_HEX[0],
    isDestination: true
  }];
  for (let i = 1; i < destinations.length; i++) {
    const dest = destinations[i];
    const color = PALETTE_HEX[i % PALETTE_HEX.length];
    const arrivalDay = (trip.days || []).find((day) => day.destinationId === dest.id && day.date === dest.arrivalDate);
    const waypoints = arrivalDay
      ? (arrivalDay.items || []).filter((item) => item.type === 'venue' && item.coordinates)
      : [];
    waypoints.forEach((w) => {
      points.push({
        name: w.name, icon: w.icon || '📍', desc: w.desc || '',
        lat: w.coordinates.lat, lng: w.coordinates.lng, color, isDestination: false
      });
    });
    points.push({
      name: dest.name, icon: dest.emoji || '📍', desc: dest.mapDescription || '',
      lat: dest.coordinates.lat, lng: dest.coordinates.lng, color, isDestination: true
    });
  }

  const map = L.map('trip-map', { scrollWheelZoom: false }).setView([points[0].lat, points[0].lng], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);

  const straightLine = points.map((p) => [p.lat, p.lng]);
  let routeLine = L.polyline(straightLine, { color: '#e8a44a', weight: 3, opacity: 0.7, dashArray: '10, 8', lineCap: 'round' }).addTo(map);

  // Snap the line to actual roads via OSRM's free public routing demo server
  // (no API key, but best-effort/rate-limited) — fall back to the straight
  // line above if it's unreachable or errors.
  try {
    const coordsParam = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsParam}?overview=full&geometries=geojson`);
    const json = await res.json();
    const geometry = json.routes && json.routes[0] && json.routes[0].geometry;
    if (geometry && geometry.coordinates && geometry.coordinates.length) {
      const roadLine = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      map.removeLayer(routeLine);
      routeLine = L.polyline(roadLine, { color: '#e8a44a', weight: 4, opacity: 0.85, lineCap: 'round' }).addTo(map);
    }
  } catch (err) {
    // Offline, or the routing service is unreachable — keep the straight-line fallback.
  }

  const popupMarkers = points.map((p, i) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: p.isDestination ? 9 : 6,
      fillColor: p.color, color: '#fff', weight: p.isDestination ? 3 : 2, fillOpacity: 0.9
    }).addTo(map).bindPopup(
      `<div style="font-family:Inter,sans-serif;min-width:140px;"><strong>${render.esc(p.icon)} ${render.esc(p.name)}</strong>${p.desc ? `<br><span style="font-size:.8rem;color:#666;">${render.esc(p.desc)}</span>` : ''}</div>`
    );
    const size = p.isDestination ? 20 : 16;
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:${p.color};color:#fff;width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${p.isDestination ? 10 : 9}px;font-weight:700;font-family:Inter;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${i + 1}</div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2]
      })
    }).addTo(map);
    return marker;
  });
  map.fitBounds(L.latLngBounds(straightLine), { padding: [30, 30] });

  // Sidebar list mirrors the map markers — clicking an entry pans to it and opens its popup.
  const listEl = document.getElementById('map-stops');
  if (!listEl) return;
  listEl.innerHTML = points.map((p, i) => `
    <div class="map-stop" data-index="${i}">
      <span class="stop-badge" style="background:${p.color}">${i + 1}</span>
      <div class="stop-body">
        <div class="stop-name">${render.esc(p.icon)} ${render.esc(p.name)}</div>
        ${p.desc ? `<div class="stop-desc">${render.esc(p.desc)}</div>` : ''}
      </div>
    </div>
  `).join('');
  listEl.querySelectorAll('.map-stop').forEach((el) => {
    el.addEventListener('click', () => {
      const i = Number(el.dataset.index);
      map.setView([points[i].lat, points[i].lng], 12, { animate: true });
      popupMarkers[i].openPopup();
    });
  });
}

const PALETTE_HEX = ['#1b5e20', '#bf360c', '#01579b', '#4a148c', '#4e342e'];

async function fillDayWeather(tripData) {
  const strip = document.getElementById('forecast-strip');
  try {
    const result = await weather.loadDayForecasts(tripData);
    const html = weather.renderForecastStrip(result);
    if (html && strip) {
      strip.innerHTML = html;
      strip.style.display = '';
    }
    document.querySelectorAll('[data-day-weather]').forEach((el) => {
      const block = el.closest('.day-block');
      const date = block?.getAttribute('data-date');
      const destId = block?.getAttribute('data-destination-id');
      const wx = destId && date ? result.byDestDate[destId]?.[date] : null;
      if (!wx) return;
      el.innerHTML = weather.renderDayWeatherChip(wx, result.symbol);
      el.hidden = false;
    });
  } catch {
    if (strip) strip.style.display = 'none';
  }
}

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

async function main() {
  const res = await fetch('data/trip.json');
  trip = await res.json();

  document.title = trip.site.title;

  const h = render.renderHeader(trip);
  document.getElementById('header-emoji-row').textContent = trip.meta.emojiRow || '';
  document.getElementById('header-trip-name').textContent = trip.meta.tripName;
  document.getElementById('header-group-name').textContent = trip.meta.groupName;
  document.getElementById('header-dates').textContent = h.dates;
  document.getElementById('header-meta').innerHTML = h.meta;

  document.getElementById('main-nav').innerHTML = render.renderNav(trip);
  document.getElementById('journey-flow').innerHTML = render.renderJourneyFlow(trip);

  const weatherNote = render.renderWeather(trip);
  if (weatherNote) {
    document.getElementById('weather-icon').textContent = weatherNote.icon;
    document.getElementById('weather-text').innerHTML = weatherNote.text;
    document.getElementById('weather-note').style.display = '';
  }

  render.resetDayColorCounter();
  document.getElementById('phases').innerHTML = render.renderPhases(trip);
  fillDayWeather(trip);

  if (!trip.destinations.some((d) => d.coordinates)) {
    document.getElementById('map').style.display = 'none';
  }

  const flightsSection = document.getElementById('flights');
  if (trip.flights?.length) {
    document.getElementById('flights-list').innerHTML = render.renderFlights(trip);
  } else {
    flightsSection.style.display = 'none';
  }

  const carSection = document.getElementById('car');
  if (trip.car) {
    document.getElementById('car-block').innerHTML = render.renderCar(trip);
  } else {
    carSection.style.display = 'none';
  }

  const lodgingSection = document.getElementById('accommodation');
  if (trip.lodging?.length) {
    document.getElementById('lodging-list').innerHTML = render.renderLodging(trip);
  } else {
    lodgingSection.style.display = 'none';
  }

  const activitiesSection = document.getElementById('activities');
  if (trip.activities?.length) {
    document.getElementById('activities-list').innerHTML = render.renderActivities(trip);
  } else {
    activitiesSection.style.display = 'none';
  }

  document.getElementById('travelers-grid').innerHTML = render.renderTravelers(trip);
  document.getElementById('site-footer').innerHTML = render.renderFooter(trip);

  if (trip.meta.theme?.backgroundImage) {
    document.documentElement.style.setProperty('--bg-image', `url('${trip.meta.theme.backgroundImage}')`);
  }
  if (trip.meta.theme?.accentColor) {
    document.documentElement.style.setProperty('--color-accent', trip.meta.theme.accentColor);
  }
  if (trip.meta.theme?.primaryColor) {
    document.documentElement.style.setProperty('--color-primary', trip.meta.theme.primaryColor);
  }

  wireInteractivity();
  updateCountdown();
  setInterval(updateCountdown, 1000);

  if (sessionStorage.getItem(SESSION_KEY) === '1') setTimeout(initMap, 200);
}

setupPasswordGate();
main();
