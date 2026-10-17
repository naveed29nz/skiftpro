import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractPdfName,
  deleteMatchedNothing,
  downloadBlob,
  formatContractDateTime,
  formatContractDay,
  formatHours,
  pdfBlobFromInvoke,
} from './contractActions.js';

test('hours and dates survive the values that crash the contract modal', () => {
  assert.equal(formatHours('18.75'), '18.8t');
  assert.equal(formatHours(18.75), '18.8t');
  assert.equal(formatHours('2,5', { plus: true }), '+2.5t');
  assert.equal(formatHours(0, { plus: true }), '+0.0t');
  assert.equal(formatHours(null), '–');
  assert.equal(formatHours('ikke', { plus: true }), '+');
  assert.equal(formatContractDay('2026-11-01'), '1. nov.');
  assert.equal(formatContractDay(''), '');
  assert.equal(formatContractDateTime('not-a-date'), '');
  assert.equal(formatContractDateTime('2026-10-16T22:20:06.311Z').length > 0, true);
});

test('a pdf invoke result is downloaded as the blob itself', () => {
  const original = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  assert.equal(pdfBlobFromInvoke(original), original);
  const fromText = pdfBlobFromInvoke('%PDF-1.4');
  assert.equal(fromText.type, 'application/pdf');
  assert.throws(() => pdfBlobFromInvoke(null), /PDF-svaret var tomt/);
  assert.equal(contractPdfName({ worker_name: 'TEST Naveed Zafar', start_date: '2026-11-01' }), 'kontrakt-TEST Naveed Zafar-2026-11-01.pdf');
});

test('the download anchor is in the document before it is clicked', () => {
  const clicks = [];
  const nodes = [];
  const doc = {
    body: {
      appendChild(node) { nodes.push(node); },
    },
    createElement() {
      return {
        click() { clicks.push('click'); },
        remove() { clicks.push('remove'); },
      };
    },
  };
  const previous = globalThis.URL;
  globalThis.URL = {
    createObjectURL() { return 'blob:pdf'; },
    revokeObjectURL() {},
  };
  try {
    downloadBlob(new Blob(['%PDF']), 'kontrakt.pdf', doc);
  } finally {
    globalThis.URL = previous;
  }
  assert.deepEqual(clicks, ['click', 'remove']);
  assert.equal(nodes[0].download, 'kontrakt.pdf');
  assert.equal(nodes[0].href, 'blob:pdf');
});

test('a delete count of zero is the only not-found result', () => {
  assert.equal(deleteMatchedNothing(0), true);
  assert.equal(deleteMatchedNothing(1), false);
  assert.equal(deleteMatchedNothing(null), false);
  assert.equal(deleteMatchedNothing(undefined), false);
});
