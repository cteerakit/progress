import type { StatusIconId } from './status-presets';

const VIEW_BOX = '0 -960 960 960';

const ICON_PATHS: Record<StatusIconId, string> = {
  radio_button_unchecked:
    'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
  circle_circle:
    'M480-360q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 50-35 85t-85 35ZM324-111.5Q251-143 197-197t-85.5-127Q80-397 80-480t31.5-156Q143-709 197-763t127-85.5Q397-880 480-880t156 31.5Q709-817 763-763t85.5 127Q880-563 880-480t-31.5 156Q817-251 763-197t-127 85.5Q563-80 480-80t-156-31.5ZM480-160q133 0 226.5-93.5T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160Zm0-320Zm141.5 141.5Q680-397 680-480t-58.5-141.5Q563-680 480-680t-141.5 58.5Q280-563 280-480t58.5 141.5Q397-280 480-280t141.5-58.5Z',
  radio_button_partial:
    'M480-280v-400q-83 0-141.5 58.5T280-480q0 83 58.5 141.5T480-280Zm0 200q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
  error:
    'M508.5-291.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5ZM440-440h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
  radio_button_checked:
    'M621.5-338.5Q680-397 680-480t-58.5-141.5Q563-680 480-680t-141.5 58.5Q280-563 280-480t58.5 141.5Q397-280 480-280t141.5-58.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
  check_circle:
    'M424-296 282-438l56-56 86 86 202-202 56 56-258 258Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
};

const FALLBACK_ICON: StatusIconId = 'radio_button_unchecked';

function resolveIconPath(iconId: string): string {
  const path = (ICON_PATHS as Record<string, string>)[iconId];
  if (path) {
    return path;
  }
  return ICON_PATHS[FALLBACK_ICON];
}

function createPath(iconId: string): SVGPathElement {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', resolveIconPath(iconId));
  path.setAttribute('fill', 'currentColor');
  return path;
}

export function createStatusIcon(
  iconId: string,
  options: { className?: string; color?: string } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');

  if (options.className) {
    svg.setAttribute('class', options.className);
  }

  if (options.color) {
    svg.style.color = options.color;
  }

  svg.append(createPath(iconId));
  return svg;
}

export function setStatusIcon(
  svg: SVGSVGElement,
  iconId: string,
  color?: string,
): void {
  const path = svg.querySelector('path');
  if (path) {
    path.setAttribute('d', resolveIconPath(iconId));
  }

  if (color) {
    svg.style.color = color;
  }
}

const HISTORY_ICON_PATH =
  'M480-120q-138 0-240.5-91.5T122-440h82q14 104 92.5 172T480-200q117 0 198.5-81.5T760-480q0-117-81.5-198.5T480-760q-69 0-129 32t-101 88h110v80H120v-240h80v94q51-64 124.5-99T480-840q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-480q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-120Zm112-192L440-464v-216h80v184l128 128-56 56Z';

const COMPLETE_ICON_VIEW_BOX = '80 -880 800 800';

const PROGRESS_RING_VIEW_SIZE = 24;
const PROGRESS_RING_CENTER = PROGRESS_RING_VIEW_SIZE / 2;
const PROGRESS_RING_RADIUS = 10.25;
const PROGRESS_RING_STROKE = 3;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;
const PROGRESS_RING_TRACK_COLOR = '#e8eaed';

export function createProgressRing(
  options: { className?: string } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${PROGRESS_RING_VIEW_SIZE} ${PROGRESS_RING_VIEW_SIZE}`);
  svg.setAttribute('aria-hidden', 'true');

  if (options.className) {
    svg.setAttribute('class', options.className);
  }

  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', String(PROGRESS_RING_CENTER));
  track.setAttribute('cy', String(PROGRESS_RING_CENTER));
  track.setAttribute('r', String(PROGRESS_RING_RADIUS));
  track.setAttribute('fill', 'none');
  track.setAttribute('stroke', PROGRESS_RING_TRACK_COLOR);
  track.setAttribute('stroke-width', String(PROGRESS_RING_STROKE));

  const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  progress.setAttribute('data-role', 'progress');
  progress.setAttribute('cx', String(PROGRESS_RING_CENTER));
  progress.setAttribute('cy', String(PROGRESS_RING_CENTER));
  progress.setAttribute('r', String(PROGRESS_RING_RADIUS));
  progress.setAttribute('fill', 'none');
  progress.setAttribute('stroke', '#34a853');
  progress.setAttribute('stroke-width', String(PROGRESS_RING_STROKE));
  progress.setAttribute('stroke-linecap', 'round');
  progress.setAttribute(
    'transform',
    `rotate(-90 ${PROGRESS_RING_CENTER} ${PROGRESS_RING_CENTER})`,
  );

  svg.append(track, progress);
  return svg;
}

export function setProgressRing(
  svg: SVGSVGElement,
  percent: number,
  color = '#34a853',
): void {
  const progress = svg.querySelector<SVGCircleElement>('circle[data-role="progress"]');
  if (!progress) {
    return;
  }

  progress.setAttribute('stroke', color);

  const clamped = Math.max(0, Math.min(100, percent));
  const offset = PROGRESS_RING_CIRCUMFERENCE * (1 - clamped / 100);
  progress.setAttribute('stroke-dasharray', String(PROGRESS_RING_CIRCUMFERENCE));
  progress.setAttribute('stroke-dashoffset', String(offset));
  progress.style.display = clamped === 0 ? 'none' : '';
}

export function createCompleteIcon(
  options: { className?: string; color?: string; iconId?: string } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', COMPLETE_ICON_VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');

  if (options.className) {
    svg.setAttribute('class', options.className);
  }

  if (options.color) {
    svg.style.color = options.color;
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', resolveIconPath(options.iconId ?? 'radio_button_checked'));
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export function setCompleteIcon(
  svg: SVGSVGElement,
  iconId: string,
  color?: string,
): void {
  const path = svg.querySelector('path');
  if (path) {
    path.setAttribute('d', resolveIconPath(iconId));
  }
  if (color) {
    svg.style.color = color;
  }
}

const TRASH_ICON_PATH =
  'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h160v-40h320v40h160v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360Z';

export function createTrashIcon(
  options: { className?: string; color?: string } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');

  if (options.className) {
    svg.setAttribute('class', options.className);
  }

  if (options.color) {
    svg.style.color = options.color;
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', TRASH_ICON_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export function createHistoryIcon(
  options: { className?: string; color?: string } = {},
): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', VIEW_BOX);
  svg.setAttribute('aria-hidden', 'true');

  if (options.className) {
    svg.setAttribute('class', options.className);
  }

  if (options.color) {
    svg.style.color = options.color;
  }

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', HISTORY_ICON_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}
