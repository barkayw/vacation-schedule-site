// Pure rendering functions: given the validated trip object, produce HTML
// strings for each section of the page. No DOM side effects live here —
// js/app.js is responsible for wiring the output into the page and adding
// interactive behavior (accordion toggles, smooth scroll, map, countdown).

const DEST_PALETTE_SIZE = 5;

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(value) {
  return esc(value).replace(/'/g, '&#39;');
}

function parseDate(iso) {
  // Parse as local, not UTC, so date-only strings don't shift a day.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatShortDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatFullDate(iso) {
  return parseDate(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

export function formatDateRange(startIso, endIso) {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = sameMonth
    ? String(end.getDate())
    : end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

function nightsBetween(startIso, endIso) {
  const ms = parseDate(endIso) - parseDate(startIso);
  return Math.max(1, Math.round(ms / 86400000));
}

function tripDayNumber(trip, iso) {
  return nightsBetween(trip.meta.startDate, iso) + 1;
}

export function destColorClass(index) {
  return `dest-color-${(index % DEST_PALETTE_SIZE) + 1}`;
}

export function phaseColorClass(index) {
  return `phase-color-${(index % DEST_PALETTE_SIZE) + 1}`;
}

function outboundFlight(trip) {
  return (trip.flights || []).find((f) => f.direction === 'outbound');
}
function returnFlight(trip) {
  return (trip.flights || []).find((f) => f.direction === 'return');
}

function lodgingFor(trip, id) {
  return (trip.lodging || []).find((l) => l.id === id);
}

function activityFor(trip, id) {
  return (trip.activities || []).find((a) => a.id === id);
}

// ---------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------

export function renderHeader(trip) {
  const nights = nightsBetween(trip.meta.startDate, trip.meta.endDate);
  const days = nights + 1;
  const metaParts = [
    `<span>${days} days · ${nights} nights</span>`,
    `<span>${trip.travelers.length} traveler${trip.travelers.length === 1 ? '' : 's'}</span>`,
    `<span>${trip.destinations.length} destination${trip.destinations.length === 1 ? '' : 's'}</span>`
  ];
  return {
    emojiRow: esc(trip.meta.emojiRow || ''),
    tripName: esc(trip.meta.tripName),
    groupName: esc(trip.meta.groupName),
    dates: `${formatShortDate(trip.meta.startDate)} — ${formatShortDate(trip.meta.endDate)}, ${parseDate(trip.meta.endDate).getFullYear()}`,
    meta: metaParts.join('')
  };
}

// ---------------------------------------------------------------------
// Nav — only include sections that have data.
// ---------------------------------------------------------------------

export function renderNav(trip) {
  const links = [['#journey', 'Journey']];
  if (trip.destinations.some((d) => d.coordinates)) links.push(['#map', 'Map']);
  if (trip.flights?.length) links.push(['#flights', 'Flights']);
  if (trip.car) links.push(['#car', 'Car']);
  if (trip.lodging?.length) links.push(['#accommodation', 'Stays']);
  if (trip.activities?.length) links.push(['#activities', 'Activities']);
  if (trip.travelers?.length) links.push(['#travelers', 'Travelers']);
  return links
    .map(([href, label], i) => `<a href="${href}"${i === 0 ? ' class="active"' : ''}>${label}</a>`)
    .join('\n');
}

// ---------------------------------------------------------------------
// Journey flow cards
// ---------------------------------------------------------------------

export function renderJourneyFlow(trip) {
  const cards = [];
  const ob = outboundFlight(trip);
  const rb = returnFlight(trip);
  const first = trip.destinations[0];
  const last = trip.destinations[trip.destinations.length - 1];

  if (ob) {
    cards.push(destCardHtml({
      colorClass: 'dest-endpoint',
      emoji: '✈️',
      name: 'Arrival',
      dateLabel: formatShortDate(ob.date),
      nightsLabel: 'Day 1',
      stayLabel: `${ob.from.code} → ${ob.to.code}`,
      phaseId: `phase-${first.id}`
    }));
  }

  trip.destinations.forEach((dest, i) => {
    if (dest.driveFromPrevious) cards.push(driveConnectorHtml(dest.driveFromPrevious));
    const lodging = lodgingFor(trip, dest.lodgingId);
    const nights = nightsBetween(dest.arrivalDate, dest.departureDate);
    cards.push(destCardHtml({
      colorClass: destColorClass(i),
      emoji: dest.emoji || '📍',
      name: dest.name,
      dateLabel: formatDateRange(dest.arrivalDate, dest.departureDate),
      nightsLabel: `${nights} night${nights === 1 ? '' : 's'}`,
      stayLabel: lodging ? lodging.name : '',
      phaseId: `phase-${dest.id}`
    }));
  });

  if (rb) {
    cards.push(destCardHtml({
      colorClass: 'dest-endpoint',
      emoji: '✈️',
      name: 'Home',
      dateLabel: formatShortDate(rb.date),
      nightsLabel: `Day ${tripDayNumber(trip, rb.date)}`,
      stayLabel: `${rb.from.code} → ${rb.to.code}`,
      phaseId: `phase-${last.id}`
    }));
  }

  return cards.join('\n');
}

function destCardHtml({ colorClass, emoji, name, dateLabel, nightsLabel, stayLabel, phaseId }) {
  return `<a class="dest-card ${colorClass}" data-phase="${attr(phaseId)}">
    <span class="dest-emoji">${esc(emoji)}</span>
    <span class="dest-name">${esc(name)}</span>
    <span class="dest-dates">${esc(dateLabel)}</span>
    <span class="dest-nights">${esc(nightsLabel)}</span>
    <span class="dest-stay">${esc(stayLabel)}</span>
  </a>`;
}

function driveConnectorHtml({ durationLabel, icon }) {
  return `<div class="drive-connector">
    <span class="conn-icon">${esc(icon || '🚗')}</span>
    <div class="conn-line"></div>
    <span class="conn-time">${esc(durationLabel || '')}</span>
  </div>`;
}

// ---------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------

export function renderWeather(trip) {
  if (!trip.weather) return null;
  return { icon: esc(trip.weather.icon || '🌤️'), text: trip.weather.text || '' };
}

// ---------------------------------------------------------------------
// Itinerary phases (one per destination)
// ---------------------------------------------------------------------

export function renderPhases(trip) {
  return trip.destinations
    .map((dest, i) => renderPhase(trip, dest, i))
    .join('\n');
}

function renderPhase(trip, dest, index) {
  const lodging = lodgingFor(trip, dest.lodgingId);
  const nights = nightsBetween(dest.arrivalDate, dest.departureDate);
  const days = trip.days.filter((d) => d.destinationId === dest.id);
  const isFirst = index === 0;
  const title = dest.tagline ? `${esc(dest.name)} — ${esc(dest.tagline)}` : esc(dest.name);
  const subtitle = [
    formatDateRange(dest.arrivalDate, dest.departureDate),
    `${nights} night${nights === 1 ? '' : 's'}`,
    lodging ? `<a href="#stay-${attr(dest.id)}" class="ctx-link">${esc(lodging.name)}</a>` : null
  ].filter(Boolean).join(' · ');

  const sidebar = lodging ? stayCardHtml(dest.id, lodging) : '';
  const dayBlocks = days.map((day) => renderDayBlock(trip, day)).join('\n');

  return `<div class="phase-section ${phaseColorClass(index)}" id="phase-${attr(dest.id)}">
    <div class="phase-header${isFirst ? ' open' : ''}" data-toggle="phase-content-${attr(dest.id)}">
      <span class="phase-emoji">${esc(dest.emoji || '📍')}</span>
      <div class="phase-info">
        <div class="phase-title">${title}</div>
        <div class="phase-subtitle">${subtitle}</div>
      </div>
      <span class="phase-toggle-btn">${isFirst ? 'Hide Itinerary ▴' : 'Show Itinerary ▾'}</span>
    </div>
    <div class="phase-content${isFirst ? ' open' : ''}" id="phase-content-${attr(dest.id)}">
      <div class="phase-grid">
        <div class="phase-sidebar">${sidebar}</div>
        <div class="phase-main">${dayBlocks}</div>
      </div>
    </div>
  </div>`;
}

function stayCardHtml(destId, lodging) {
  const img = lodging.image
    ? `<a href="${attr(lodging.bookingUrl || '#stay-' + destId)}" target="_blank" class="stay-hero-wrapper">
        <img src="${attr(lodging.image)}" alt="${attr(lodging.name)}" class="stay-hero">
        <div class="overlay-badge">🔗 View Listing</div>
      </a>`
    : '';
  return `<div class="stay-card">
    ${img}
    <div class="stay-card-details">
      <h4>🏡 Stay: ${esc(lodging.name)}</h4>
      <p class="stay-card-meta">${esc([lodging.host, lodging.type].filter(Boolean).join(' · '))}</p>
      <p class="stay-card-dates">📅 ${esc(lodging.checkIn)} – ${esc(lodging.checkOut)}</p>
      <div class="stay-card-actions">
        <a href="#stay-${attr(destId)}" class="ctx-link">View Booking Details</a>
      </div>
    </div>
  </div>`;
}

let dayColorCounter = 0;
export function resetDayColorCounter() { dayColorCounter = 0; }

function renderDayBlock(trip, day) {
  const colorClass = `day-color-${(dayColorCounter++ % 5) + 1}`;
  const dateLabel = day.dateLabel || formatFullDate(day.date);
  const items = (day.items || []).map((item) => renderDayItem(trip, item)).join('\n');
  return `<div class="day-block ${colorClass}">
    <div class="day-block-header">
      <span class="day-num">${esc(day.dayNumber || '')}${day.dayNumber ? ' — ' : ''}${esc(day.title.replace(/^Day\s*\d+\s*—\s*/i, ''))}</span>
      <span class="day-date">${esc(dateLabel)}</span>
    </div>
    ${day.theme ? `<p class="day-theme">${esc(day.theme)}</p>` : ''}
    ${items}
    ${day.note ? `<div class="day-note">${esc(day.note)}</div>` : ''}
  </div>`;
}

function renderDayItem(trip, item) {
  if (item.type === 'drive') {
    return `<div class="drive-segment">
      <span class="drive-icon">🚗</span>
      <div class="drive-info">
        <div class="drive-route">${esc(item.route)}</div>
        ${item.meta ? `<div class="drive-meta">${esc(item.meta)}</div>` : ''}
      </div>
      <span class="drive-duration">${esc(item.duration)}</span>
    </div>`;
  }
  if (item.type === 'venue') {
    return renderVenueCard(trip, item);
  }
  // event
  const linkHtml = item.link
    ? ` <a href="${attr(item.link.href)}" target="${item.link.href.startsWith('#') ? '_self' : '_blank'}" class="ctx-link">${esc(item.link.text)}</a>`
    : '';
  return `<ul><li>${item.time ? `<span class="li-time">${esc(item.time)}</span>` : ''}<span class="li-icon">${esc(item.icon || '')}</span> ${esc(item.text)}${linkHtml}</li></ul>`;
}

function renderVenueCard(trip, item) {
  const nameLink = item.link
    ? `<a href="${attr(item.link)}" target="_blank">${esc(item.name)}<span class="map-icon">🔗</span></a>`
    : esc(item.name);
  const mapLink = item.mapLink
    ? ` <a href="${attr(item.mapLink)}" target="_blank" title="Google Maps"><span class="map-icon">📍</span></a>`
    : '';
  const activity = item.activityId ? activityFor(trip, item.activityId) : null;
  const bookingLink = activity ? ` <a href="#activity-${attr(activity.id)}" class="ctx-link" title="Booking Info" style="font-size:.7em;opacity:.6;text-decoration:none;">🎟️</a>` : '';

  const badge = activity
    ? `<div class="booking-confirmed-badge">✅ ${esc(activity.status || 'BOOKED')} — ${esc(activity.tickets || '')} · <a href="#activity-${attr(activity.id)}" class="ctx-link" style="font-size:inherit;">${esc(activity.confirmation || '')}</a></div>`
    : '';

  const highlights = (item.highlights || []).map((h) => `<li>${esc(h)}</li>`).join('');

  return `<div class="venue-card">
    <div class="venue-header">
      <span class="venue-name">${esc(item.icon || '')} ${nameLink}${mapLink}${bookingLink}</span>
      ${item.time ? `<span class="venue-time">${esc(item.time)}</span>` : ''}
    </div>
    ${item.desc ? `<p class="venue-desc">${esc(item.desc)}</p>` : ''}
    ${badge}
    ${highlights ? `<ul class="venue-highlights">${highlights}</ul>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------
// Flights
// ---------------------------------------------------------------------

export function renderFlights(trip) {
  return (trip.flights || []).map((f) => {
    const rows = [
      f.confirmation ? row('Confirmation', f.confirmation) : '',
      f.class ? row('Class', f.class) : '',
      ...(f.bagInfo || []).map((b) => row(b.label, b.value)),
      f.cost ? row('Total Cost', f.cost) : '',
      f.payment ? row('Payment', f.payment) : ''
    ].join('');
    return `<div class="detail-block">
      <div class="detail-block-header">
        <div class="block-icon icon-flight">✈️</div>
        <h3>${f.direction === 'outbound' ? 'Outbound' : 'Return'} — ${esc(formatFullDate(f.date))}</h3>
        <span class="block-badge">${esc(f.flightNumber)}</span>
      </div>
      <div class="flight-route">
        <div class="flight-airport"><div class="code">${esc(f.from.code)}</div><div class="city">${esc(f.from.city)}</div><div class="time">${esc(f.from.time)}</div></div>
        <div class="flight-line"><div class="nonstop">${f.nonstop ? 'Nonstop' : 'Connecting'}</div><div class="line"></div><div class="duration">${esc(f.duration || '')}</div></div>
        <div class="flight-airport"><div class="code">${esc(f.to.code)}</div><div class="city">${esc(f.to.city)}</div><div class="time">${esc(f.to.time)}</div></div>
      </div>
      <div class="detail-grid">${rows}</div>
    </div>`;
  }).join('\n');
}

function row(label, value) {
  return `<div class="detail-row"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
}
function rowFull(label, valueHtml) {
  return `<div class="detail-row full-width"><span class="label">${esc(label)}</span><span class="value">${valueHtml}</span></div>`;
}

// ---------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------

export function renderCar(trip) {
  const c = trip.car;
  if (!c) return '<p style="color:#aaa;font-size:.85rem;">No rental car for this trip.</p>';
  const rows = [
    c.vehicle ? row('Vehicle', c.vehicle) : '',
    c.transmission ? row('Transmission', c.transmission) : '',
    c.doorsSeats ? row('Doors / Seats', c.doorsSeats) : '',
    c.confirmation ? row('Confirmation #', c.confirmation) : '',
    c.partnerRef ? row('Partner Ref', c.partnerRef) : '',
    c.pickUp ? row('Pick-Up', c.pickUp) : '',
    c.dropOff ? row('Drop-Off', c.dropOff) : '',
    c.duration ? row('Duration', c.duration) : '',
    c.cost ? row('Total Cost', c.cost) : '',
    c.deposit ? row('Security Deposit', c.deposit) : '',
    c.pickupType ? row('Pick-Up Type', c.pickupType) : '',
    c.location ? rowFull('Location', c.locationMapUrl ? `<a href="${attr(c.locationMapUrl)}" target="_blank" class="ctx-link">${esc(c.location)}<span class="map-icon">📍</span></a>` : esc(c.location)) : '',
    c.address ? rowFull('Address', c.addressMapUrl ? `<a href="${attr(c.addressMapUrl)}" target="_blank" class="ctx-link">${esc(c.address)}<span class="map-icon">📍</span></a>` : esc(c.address)) : '',
    c.driver ? row('Driver', c.driver) : '',
    c.contactPhone ? row('Contact', `${esc(c.contactLabel || '')} ${c.contactLabel ? ':' : ''} <a href="tel:${attr(c.contactPhone.replace(/[^+\d]/g, ''))}" class="ctx-link">${esc(c.contactPhone)}</a>`) : '',
    c.flightNumber ? row('Flight #', c.flightNumber) : ''
  ].join('');
  const notes = (c.notes || []).map((n) => esc(n)).join('<br>');
  return `<div class="detail-block">
    <div class="detail-block-header">
      <div class="block-icon icon-car">🚙</div>
      <h3>${esc(c.company)}${c.vehicle ? ' — ' + esc(c.vehicle) : ''}</h3>
      <span class="block-badge">Confirmed</span>
    </div>
    <div class="detail-grid">${rows}</div>
    ${notes ? `<div style="margin-top:.8rem;padding:.6rem .8rem;background:rgba(45,122,74,0.15);border-radius:10px;border-left:3px solid #ffb74d;font-size:.78rem;color:#bbb;line-height:1.6;">${notes}</div>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------
// Lodging
// ---------------------------------------------------------------------

export function renderLodging(trip) {
  return (trip.lodging || []).map((l) => {
    const thumb = l.image
      ? `<a href="${attr(l.bookingUrl || '#')}" target="_blank" class="stay-thumb-wrapper">
          <img src="${attr(l.image)}" alt="${attr(l.name)}" class="stay-thumb">
          <div class="overlay-badge">🔗 View Listing</div>
        </a>`
      : '';
    const rows = [
      rowFull('Property', l.bookingUrl ? `<a href="${attr(l.bookingUrl)}" target="_blank" class="ctx-link">${esc(l.name)} <span class="map-icon">🔗</span></a>` : esc(l.name)),
      l.host ? row('Host', l.host) : '',
      l.confirmation ? row('Confirmation', l.confirmation) : '',
      l.phone ? row('Phone', l.phone) : '',
      l.checkIn ? row('Check-In', l.checkIn) : '',
      l.checkOut ? row('Check-Out', l.checkOut) : '',
      l.guests ? row('Guests', l.guests) : '',
      l.nights ? row('Nights', `${l.nights} night${l.nights === 1 ? '' : 's'}`) : '',
      l.cost ? row('Cost', l.cost) : '',
      l.payment ? row('Payment', l.payment) : '',
      l.address ? rowFull('Address', l.addressMapUrl ? `<a href="${attr(l.addressMapUrl)}" target="_blank" class="ctx-link">${esc(l.address)}<span class="map-icon">📍</span></a>` : esc(l.address)) : ''
    ].join('');
    const notes = (l.notes || []).map((n) => esc(n)).join('<br>');
    return `<div class="detail-block" id="stay-${attr(l.id)}">
      <div class="detail-block-header">
        <div class="block-icon icon-hotel">🏡</div>
        <h3>${esc(l.name)}</h3>
        <span class="block-badge">${esc(l.type || 'Booking')}</span>
      </div>
      ${thumb}
      <div class="detail-grid">${rows}</div>
      ${notes ? `<div style="margin-top:.8rem;padding:.6rem .8rem;background:#f0f8e8;border-radius:10px;border-left:3px solid var(--color-accent);font-size:.78rem;color:#666;line-height:1.5;">${notes}</div>` : ''}
      ${l.bookingUrl ? `<a href="${attr(l.bookingUrl)}" target="_blank" class="airbnb-link">🏡 View Listing</a>` : ''}
    </div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------

export function renderActivities(trip) {
  return (trip.activities || []).map((a) => {
    const rows = [
      a.confirmation ? row(a.confirmationLabel || 'Confirmation #', a.confirmation) : '',
      a.date ? row('Activity Date', a.date) : '',
      a.startTime ? row('Start Time', a.startTime) : '',
      a.duration ? row('Duration', a.duration) : '',
      a.tickets ? row('Tickets', a.tickets) : '',
      a.package ? rowFull('Package', a.package) : '',
      a.addOn ? rowFull('Add-On', a.addOn) : '',
      ...(a.pricing || []).map((p) => row(p.label, p.value)),
      a.bookedBy ? row('Booked By', a.bookedBy) : ''
    ].join('');
    const notes = (a.notes || []).map((n) => esc(n)).join('<br>');
    return `<div class="detail-block" id="activity-${attr(a.id)}">
      <div class="detail-block-header">
        <div class="block-icon icon-activity">${esc(a.icon || '🎟️')}</div>
        <h3>${esc(a.name)}</h3>
        <span class="block-badge">${esc(a.status || 'Confirmed')}</span>
      </div>
      <div class="detail-grid">${rows}</div>
      ${notes ? `<div style="margin-top:.8rem;padding:.6rem .8rem;background:rgba(45,122,74,0.15);border-radius:10px;border-left:3px solid var(--color-accent);font-size:.78rem;color:#bbb;line-height:1.6;">${notes}</div>` : ''}
      ${a.portalUrl ? `<a href="${attr(a.portalUrl)}" target="_blank" class="portal-link">🔗 Customer Portal — Manage Booking</a>` : ''}
    </div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------
// Travelers
// ---------------------------------------------------------------------

export function renderTravelers(trip) {
  return (trip.travelers || []).map((t) => {
    const seatEntries = Object.entries(t.seats || {});
    const seatInfo = seatEntries
      .map(([dir, seat]) => `${dir === 'outbound' ? 'Outbound' : dir === 'return' ? 'Return' : esc(dir)}: <span class="seat-tag">${esc(seat)}</span>`)
      .join('<br>');
    return `<div class="traveler-card">
      <div class="traveler-name">${esc(t.emoji || '🧑')} ${esc(t.name)}</div>
      ${seatInfo ? `<div class="seat-info">${seatInfo}</div>` : ''}
    </div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------

export function renderFooter(trip) {
  return `Made with <span>♥</span> for the ${esc(trip.meta.groupName)}`;
}
