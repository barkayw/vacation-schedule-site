import * as render from './render.js';

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

function initMap() {
  const mapEl = document.getElementById('trip-map');
  if (!mapEl || mapEl._leaflet_id) return;
  const locations = trip.destinations
    .filter((d) => d.coordinates)
    .map((d, i) => ({
      name: `${d.emoji || '📍'} ${d.name}`,
      lat: d.coordinates.lat,
      lng: d.coordinates.lng,
      desc: d.mapDescription || '',
      color: PALETTE_HEX[i % PALETTE_HEX.length]
    }));
  if (!locations.length) {
    document.getElementById('map').style.display = 'none';
    return;
  }

  const map = L.map('trip-map', { scrollWheelZoom: false }).setView([locations[0].lat, locations[0].lng], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 18
  }).addTo(map);

  const route = locations.map((l) => [l.lat, l.lng]);
  L.polyline(route, { color: '#e8a44a', weight: 3, opacity: 0.7, dashArray: '10, 8', lineCap: 'round' }).addTo(map);

  locations.forEach((loc, i) => {
    L.circleMarker([loc.lat, loc.lng], {
      radius: i === 0 || i === locations.length - 1 ? 7 : 9,
      fillColor: loc.color, color: '#fff', weight: 3, fillOpacity: 0.9
    }).addTo(map).bindPopup(
      `<div style="font-family:Inter,sans-serif;min-width:140px;"><strong>${render.esc(loc.name)}</strong><br><span style="font-size:.8rem;color:#666;">${render.esc(loc.desc)}</span></div>`
    );
    L.marker([loc.lat, loc.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="background:${loc.color};color:#fff;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;font-family:Inter;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);">${i + 1}</div>`,
        iconSize: [20, 20], iconAnchor: [10, 10]
      })
    }).addTo(map);
  });
  map.fitBounds(L.latLngBounds(route), { padding: [30, 30] });
}

const PALETTE_HEX = ['#1b5e20', '#bf360c', '#01579b', '#4a148c', '#4e342e'];

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

  const weather = render.renderWeather(trip);
  if (weather) {
    document.getElementById('weather-icon').textContent = weather.icon;
    document.getElementById('weather-text').innerHTML = weather.text;
    document.getElementById('weather-note').style.display = '';
  }

  render.resetDayColorCounter();
  document.getElementById('phases').innerHTML = render.renderPhases(trip);

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
