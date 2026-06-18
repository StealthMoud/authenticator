/* global AuthenticatorApp */

AuthenticatorApp.prototype.escapeHtml = function(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

AuthenticatorApp.prototype.togglePrivacyMode = function() {
  this.privacyMode = !this.privacyMode;
  chrome.storage.local.set({ privacyMode: this.privacyMode });
  this.render();
};

AuthenticatorApp.prototype.showToast = function(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerText = msg;
  if (this.toastContainer) this.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 2500);
};

AuthenticatorApp.prototype.showStatus = function(msg, type) {
  if (this.statusMsg) {
    this.statusMsg.innerText = msg;
    this.statusMsg.className = `status-message status-${type}`;
    this.statusMsg.style.display = 'block';
  }
};

AuthenticatorApp.prototype.setupResizeHandler = function() {
  const edgeLeft = document.getElementById('resize-edge-left');
  const edgeRight = document.getElementById('resize-edge-right');
  const edgeBottom = document.getElementById('resize-edge-bottom');
  if (!edgeLeft && !edgeRight && !edgeBottom) return;

  // Load persisted dimensions
  chrome.storage.local.get(['popupWidth', 'popupHeight'], (res) => {
    if (res.popupWidth) {
      document.body.style.width = `${res.popupWidth}px`;
    }
    if (res.popupHeight) {
      document.body.style.height = `${res.popupHeight}px`;
    }
  });

  const bindResize = (edge, type) => {
    edge.addEventListener('mousedown', (e) => {
      e.preventDefault();
      edge.classList.add('dragging');
      const startWidth = document.body.clientWidth;
      const startHeight = document.body.clientHeight;
      const startX = e.clientX;
      const startY = e.clientY;

      const onMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        if (type === 'left') {
          let newWidth = startWidth - deltaX;
          newWidth = Math.max(380, Math.min(800, newWidth));
          document.body.style.width = `${newWidth}px`;
        } else if (type === 'right') {
          let newWidth = startWidth + deltaX;
          newWidth = Math.max(380, Math.min(800, newWidth));
          document.body.style.width = `${newWidth}px`;
        } else if (type === 'bottom') {
          let newHeight = startHeight + deltaY;
          newHeight = Math.max(520, Math.min(600, newHeight));
          document.body.style.height = `${newHeight}px`;
        }
      };

      const onMouseUp = () => {
        edge.classList.remove('dragging');
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Persist dimensions
        chrome.storage.local.set({
          popupWidth: document.body.clientWidth,
          popupHeight: document.body.clientHeight
        });
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  };

  if (edgeLeft) bindResize(edgeLeft, 'left');
  if (edgeRight) bindResize(edgeRight, 'right');
  if (edgeBottom) bindResize(edgeBottom, 'bottom');
};

AuthenticatorApp.prototype.getIssuerIcon = function(issuer) {
  const clean = (issuer || '').toLowerCase().trim();
  if (!clean) {
    return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }

  // Helper funcition to map user account issuers to brand icons
  let key = null;
  if (clean.includes('google')) key = 'google';
  else if (clean.includes('github')) key = 'github';
  else if (clean.includes('instagram') || clean.includes('intagram')) key = 'instagram';
  else if (clean.includes('discord')) key = 'discord';
  else if (clean.includes('microsoft') || clean.includes('outlook') || clean.includes('live') || clean.includes('azure')) key = 'microsoft';
  else if (clean.includes('slack')) key = 'slack';
  else if (clean.includes('facebook')) key = 'facebook';
  else if (clean.includes('twitter') || clean.includes('x.com') || clean === 'x') key = 'x';
  else if (clean.includes('twitch')) key = 'twitch';
  else if (clean.includes('gitlab')) key = 'gitlab';
  else if (clean.includes('steam')) key = 'steam';
  else if (clean.includes('epic')) key = 'epic';
  else if (clean.includes('reddit')) key = 'reddit';
  else if (clean.includes('bitbucket')) key = 'bitbucket';
  else if (clean.includes('digitalocean') || clean.includes('digital ocean')) key = 'digitalocean';
  else if (clean.includes('heroku')) key = 'heroku';
  else if (clean.includes('cloudflare')) key = 'cloudflare';
  else if (clean.includes('openai') || clean.includes('chatgpt')) key = 'openai';
  else if (clean.includes('zoom')) key = 'zoom';
  else if (clean.includes('spotify')) key = 'spotify';
  else if (clean.includes('paypal')) key = 'paypal';
  else if (clean.includes('stripe')) key = 'stripe';
  else if (clean.includes('adobe')) key = 'adobe';
  else if (clean.includes('linkedin')) key = 'linkedin';
  else if (clean.includes('yahoo')) key = 'yahoo';
  else if (clean.includes('amazon') || clean.includes('aws')) key = 'amazon';
  else if (clean.includes('apple')) key = 'apple';
  else if (clean.includes('coinbase')) key = 'coinbase';
  else if (clean.includes('binance')) key = 'binance';
  else if (clean.includes('voorivex')) key = 'voorivex';
  else if (clean.includes('hackerone') || clean.includes('h1')) key = 'hackerone';
  else if (clean.includes('bugcrowd')) key = 'bugcrowd';
  else if (clean.includes('intigriti')) key = 'intigriti';
  else if (clean.includes('yeswehack')) key = 'yeswehack';
  else if (clean.includes('synack')) key = 'synack';
  else if (clean.includes('notion')) key = 'notion';
  else if (clean.includes('ngrok')) key = 'ngrok';

  if (key && window.BRAND_ICONS && window.BRAND_ICONS[key]) {
    const icon = window.BRAND_ICONS[key];
    if (typeof icon === 'object') {
      return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" fill="currentColor">${icon.html}</svg>`;
    }
    return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="${icon}"/></svg>`;
  }

  // fallback to outline padlock if brand not resolved
  return `<svg class="brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
};

AuthenticatorApp.prototype.inferIssuer = function(label, currentIssuer) {
  const lbl = (label || '').trim();
  if (lbl.includes(':')) {
    return lbl.split(':')[0].trim();
  }
  const lblLower = lbl.toLowerCase();
  const brands = [
    'google', 'github', 'instagram', 'discord', 'microsoft', 'outlook', 'live', 'azure', 
    'slack', 'facebook', 'twitter', 'twitch', 'gitlab', 'steam', 'epic', 'reddit', 
    'bitbucket', 'digitalocean', 'heroku', 'cloudflare', 'openai', 'zoom', 'spotify', 
    'paypal', 'stripe', 'adobe', 'linkedin', 'yahoo', 'amazon', 'aws', 'apple', 
    'coinbase', 'binance', 'voorivex', 'hackerone', 'h1', 'bugcrowd', 'intigriti', 
    'yeswehack', 'synack', 'notion', 'ngrok'
  ];
  const foundBrand = brands.find(b => lblLower.includes(b));
  if (foundBrand) {
    if (foundBrand === 'hackerone' || foundBrand === 'h1') return 'HackerOne';
    if (foundBrand === 'yeswehack') return 'YesWeHack';
    if (foundBrand === 'voorivex') return 'Voorivex';
    if (foundBrand === 'bugcrowd') return 'Bugcrowd';
    if (foundBrand === 'intigriti') return 'Intigriti';
    if (foundBrand === 'synack') return 'Synack';
    if (foundBrand === 'notion') return 'Notion';
    if (foundBrand === 'ngrok') return 'ngrok';
    return foundBrand.charAt(0).toUpperCase() + foundBrand.slice(1);
  }
  return currentIssuer || 'Unknown';
};

AuthenticatorApp.prototype.applyFiltersAndSort = function() {
  const term = this.searchInput.value.toLowerCase().trim();
  let result = this.accounts.filter(a => {
    const issuer = (a.issuer || '').toLowerCase();
    const label = (a.label || '').toLowerCase();
    return issuer.includes(term) || label.includes(term);
  });
  const dir = this.sortAscending ? 1 : -1;

  if (this.currentSort === 'name') {
    result.sort((a, b) => {
      const valA = ((a.issuer || '') + (a.label || '')).toLowerCase();
      const valB = ((b.issuer || '') + (b.label || '')).toLowerCase();
      return valA.localeCompare(valB) * dir;
    });
  } else if (this.currentSort === 'newest') {
    result.sort((a, b) => (b.id - a.id) * dir);
  } else if (this.currentSort === 'recent') {
    result.sort((a, b) => ((b.lastUsed || 0) - (a.lastUsed || 0)) * dir);
  } else if (this.currentSort === 'custom') {
    if (!this.sortAscending) result.reverse();
  }
  this.filteredAccounts = result;
  this.render();
};

