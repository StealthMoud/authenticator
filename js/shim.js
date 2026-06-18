if (typeof chrome === 'undefined' || !chrome.storage) {
  window.chrome = {
    identity: {
      getProfileUserInfo: (opts, cb) => cb({ email: 'demo@example.com' })
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const res = {};
          // demo accounts for local dev preview only — not real credentials
          const mockAccounts = [
            { id: '1', issuer: 'Google', label: 'demo@example.com', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '2', issuer: 'GitHub', label: 'demo_user', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '3', issuer: 'Discord', label: 'demo_user#0001', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '4', issuer: 'Microsoft', label: 'demo@example.com', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '5', issuer: 'Slack', label: 'demo workspace', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '6', issuer: 'Facebook', label: 'demo profile', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '7', issuer: 'Instagram', label: 'demo_photos', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '8', issuer: 'Twitter', label: 'demo_tweets', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '9', issuer: 'Twitch', label: 'demo_stream', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '10', issuer: 'GitLab', label: 'demo_dev', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '11', issuer: 'Steam', label: 'demo_gamer', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '12', issuer: 'Epic Games', label: 'demo_epic', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '13', issuer: 'Reddit', label: 'demo_lurker', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '14', issuer: 'Bitbucket', label: 'demo_repos', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '15', issuer: 'DigitalOcean', label: 'demo_vps', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '16', issuer: 'Heroku', label: 'demo_dyno', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '17', issuer: 'Cloudflare', label: 'demo_dns', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '18', issuer: 'OpenAI', label: 'demo_api', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '19', issuer: 'Zoom', label: 'demo_meeting', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '20', issuer: 'Spotify', label: 'demo_music', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '21', issuer: 'PayPal', label: 'demo_payments', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '22', issuer: 'Stripe', label: 'demo_merchant', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '23', issuer: 'Adobe', label: 'demo_creative', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '24', issuer: 'LinkedIn', label: 'demo_network', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '25', issuer: 'Yahoo', label: 'demo_mail', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '26', issuer: 'Amazon', label: 'demo_shop', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '27', issuer: 'Apple', label: 'demo_icloud', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '28', issuer: 'Coinbase', label: 'demo_wallet', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '29', issuer: 'Binance', label: 'demo_exchange', secret: 'JBSWY3DPEHPK3PXP' },
            { id: '30', issuer: 'Voorivex', label: 'demo_academy', secret: 'JBSWY3DPEHPK3PXP', profile: 'alice@example.com, bob@example.com, carol@example.com' },
            { id: '31', issuer: 'HackerOne', label: 'demo_h1', secret: 'JBSWY3DPEHPK3PXP', profile: 'bob@example.com' },
            { id: '32', issuer: 'Bugcrowd', label: 'demo_bugcrowd', secret: 'JBSWY3DPEHPK3PXP', profile: 'alice@example.com' },
            { id: '33', issuer: 'Intigriti', label: 'demo_intigriti', secret: 'JBSWY3DPEHPK3PXP', profile: 'carol@example.com' },
            { id: '34', issuer: 'YesWeHack', label: 'demo_ywh', secret: 'JBSWY3DPEHPK3PXP', profile: 'bob@example.com' },
            { id: '35', issuer: 'Synack', label: 'demo_synack', secret: 'JBSWY3DPEHPK3PXP', profile: 'bob@example.com' },
            { id: '36', issuer: 'Notion', label: 'demo_notes', secret: 'JBSWY3DPEHPK3PXP', profile: 'alice@example.com' },
            { id: '37', issuer: 'ngrok', label: 'demo_tunnels', secret: 'JBSWY3DPEHPK3PXP', profile: 'carol@example.com' }
          ];

          keys.forEach(k => {
            if (k === 'authenticator_accounts') {
              res[k] = mockAccounts;
            } else if (k === 'privacyMode') {
              res[k] = false;
            } else if (k === 'sortAscending') {
              res[k] = true;
            } else if (k === 'popupWidth') {
              res[k] = 360;
            } else if (k === 'popupHeight') {
              res[k] = 520;
            }
          });
          cb(res);
        },
        set: (vals, cb) => { if (cb) cb(); },
        remove: (keys, cb) => { if (cb) cb(); }
      }
    },
    runtime: {
      sendMessage: (msg, cb) => { if (cb) cb({ success: true }); }
    }
  };
}
