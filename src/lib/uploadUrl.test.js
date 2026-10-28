import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadObjectPath } from './uploadUrl.js';

test('a stored public upload URL becomes the object path', () => {
  const stored = 'https://example.supabase.co/storage/v1/object/public/uploads/user-1/1710000-bilde.png';
  assert.equal(uploadObjectPath(stored), 'user-1/1710000-bilde.png');
});

test('a signed URL and a bare path point at the same object', () => {
  const signed = 'https://example.supabase.co/storage/v1/object/sign/uploads/user-1/a%20b.png?token=abc';
  assert.equal(uploadObjectPath(signed), 'user-1/a b.png');
  assert.equal(uploadObjectPath('user-1/a b.png'), 'user-1/a b.png');
  assert.equal(uploadObjectPath('uploads/user-1/a b.png'), 'user-1/a b.png');
});

test('other hosts and parent paths are not treated as uploads', () => {
  assert.equal(uploadObjectPath('https://example.com/bilde.png'), '');
  assert.equal(uploadObjectPath('../secrets.png'), '');
  assert.equal(uploadObjectPath(''), '');
});
