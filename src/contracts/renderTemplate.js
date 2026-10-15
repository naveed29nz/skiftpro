/**
 * Small Mustache-style renderer. It substitutes {{felt}}, repeats {{#liste}}
 * and keeps or drops {{#flag}} / {{^flag}} blocks. It does not evaluate
 * expressions, so a template cannot run code.
 *
 * Values are HTML-escaped. Missing {{felt}} values become empty and are
 * reported so the caller can refuse to send an incomplete contract.
 */

const SECTION_RE = /\{\{\s*([#^])\s*([a-zA-Z0-9_]+)\s*\}\}((?:(?!\{\{\s*[#^/])[\s\S])*?)\{\{\s*\/\s*\2\s*\}\}/;

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

export function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === false || value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return Boolean(value);
}

function lookup(data, key) {
  if (!data || typeof data !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

function substituteVars(text, data, missing, seen) {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = lookup(data, key);
    if (value == null || value === '') {
      if (!seen.has(key)) {
        seen.add(key);
        missing.push(key);
      }
      return '';
    }
    return escapeHtml(value);
  });
}

function expandSections(template, data, missing, seen) {
  let text = template;
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const match = SECTION_RE.exec(text);
    if (!match) break;
    const [full, kind, key, body] = match;
    const value = lookup(data, key);
    const truthy = isTruthy(value);
    let rendered = '';
    if (kind === '^') {
      rendered = truthy ? '' : substituteVars(body, data, missing, seen);
    } else if (truthy && Array.isArray(value)) {
      rendered = value.map((item) => {
        const ctx = item && typeof item === 'object' && !Array.isArray(item)
          ? { ...data, ...item }
          : data;
        return substituteVars(body, ctx, missing, seen);
      }).join('');
    } else if (truthy) {
      rendered = substituteVars(body, data, missing, seen);
    }
    text = text.slice(0, match.index) + rendered + text.slice(match.index + full.length);
  }
  return text;
}

export function renderTemplate(template, data = {}) {
  const missing = [];
  const seen = new Set();
  const source = template == null ? '' : String(template);
  let text = expandSections(source, data, missing, seen);
  text = substituteVars(text, data, missing, seen);
  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text) text += '\n';
  return { text, missing };
}
