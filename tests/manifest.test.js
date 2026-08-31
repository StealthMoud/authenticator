const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('uses Manifest V3 with optional, narrowly scoped GitHub access', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.optional_host_permissions, ['https://api.github.com/*']);
  assert.equal(manifest.permissions.includes('<all_urls>'), false);
  assert.equal(manifest.permissions.includes('tabs'), false);
});

test('keeps extension pages on a packaged-code content security policy', () => {
  const policy = manifest.content_security_policy.extension_pages;
  assert.match(policy, /script-src 'self'/);
  assert.match(policy, /style-src 'self'/);
  assert.match(policy, /connect-src https:\/\/api\.github\.com/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:\/\/\*/);
});

test('ships no inline styles, inline scripts, or remote page assets', () => {
  ['popup.html', 'permission.html'].forEach((filename) => {
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.doesNotMatch(html, /<style\b/i, filename);
    assert.doesNotMatch(html, /<script(?![^>]+src=)[^>]*>/i, filename);
    assert.doesNotMatch(html, /(?:src|href)=["']https?:\/\//i, filename);
  });
});
