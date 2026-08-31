if (typeof chrome === 'undefined' || !chrome.storage) {
  const now = Date.now();
  const mockAccounts = [
    {
      id: 'demo-github',
      issuer: 'GitHub',
      label: 'mira@northstar.dev',
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/GitHub:mira%40northstar.dev?issuer=GitHub&secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30',
      createdAt: now - 86400000 * 94,
      updatedAt: now - 3600000,
      lastUsed: now - 180000,
      useCount: 38
    },
    {
      id: 'demo-cloudflare',
      issuer: 'Cloudflare',
      label: 'northstar.dev',
      secret: 'KRUGS4ZANFZSAYJA',
      uri: 'otpauth://totp/Cloudflare:northstar.dev?issuer=Cloudflare&secret=KRUGS4ZANFZSAYJA&algorithm=SHA1&digits=6&period=30',
      createdAt: now - 86400000 * 41,
      updatedAt: now - 7200000,
      lastUsed: now - 86400000 * 2,
      useCount: 17
    },
    {
      id: 'demo-openai',
      issuer: 'OpenAI',
      label: 'research@northstar.dev',
      secret: 'ONSWG4TFOQXHI2DF',
      uri: 'otpauth://totp/OpenAI:research%40northstar.dev?issuer=OpenAI&secret=ONSWG4TFOQXHI2DF&algorithm=SHA256&digits=8&period=60',
      createdAt: now - 86400000 * 16,
      updatedAt: now - 86400000,
      lastUsed: now - 86400000 * 4,
      useCount: 9
    },
    {
      id: 'demo-slack',
      issuer: 'Slack',
      label: 'Northstar workspace',
      secret: 'GEZDGNBVGY3TQOJQ',
      uri: 'otpauth://totp/Slack:Northstar%20workspace?issuer=Slack&secret=GEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=6&period=30',
      createdAt: now - 86400000 * 8,
      updatedAt: now - 86400000 * 2,
      lastUsed: 0,
      useCount: 0
    }
  ];

  const state = {
    authenticator_accounts: mockAccounts,
    privacyMode: false,
    sortAscending: true,
    currentSort: 'custom',
    loadedProfiles: [],
    localUnsynced: false,
    deletedAccountKeys: [],
    popupWidth: 420,
    popupHeight: 600
  };

  const pickValues = (keys) => {
    if (typeof keys === 'string') return { [keys]: state[keys] };
    if (Array.isArray(keys)) {
      return keys.reduce((result, key) => {
        if (Object.prototype.hasOwnProperty.call(state, key)) result[key] = state[key];
        return result;
      }, {});
    }
    if (keys && typeof keys === 'object') {
      return Object.keys(keys).reduce((result, key) => {
        result[key] = Object.prototype.hasOwnProperty.call(state, key) ? state[key] : keys[key];
        return result;
      }, {});
    }
    return { ...state };
  };

  window.chrome = {
    identity: {
      getProfileUserInfo: (options, callback) => callback({ email: 'demo@this-browser.local' })
    },
    permissions: {
      contains: (request, callback) => callback(true),
      request: (request, callback) => callback(true),
      remove: (request, callback) => callback(true)
    },
    storage: {
      local: {
        get: (keys, callback) => callback(pickValues(keys)),
        set: (values, callback) => {
          Object.assign(state, values);
          if (callback) callback();
        },
        remove: (keys, callback) => {
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete state[key]);
          if (callback) callback();
        }
      }
    },
    tabs: {
      create: () => {}
    },
    runtime: {
      id: 'authenticator-demo',
      lastError: null,
      getURL: (path) => new URL(path || '', window.location.href).href,
      sendMessage: (message, callback) => {
        if (message.action === 'vault:identity') {
          callback({ success: true, profile: 'demo@this-browser.local' });
          return;
        }
        if (message.action === 'vault:fetch') {
          callback({ success: true, profile: 'demo@this-browser.local', profiles: [] });
          return;
        }
        if (message.action === 'vault:sync' || message.action === 'githubSync') {
          const accounts = message.payload ? message.payload.accounts : message.data;
          callback({
            success: true,
            profile: 'demo@this-browser.local',
            mergedAccounts: accounts,
            profiles: [],
            pulled: 0,
            pushed: 0,
            deleted: 0,
            syncedAt: new Date().toISOString()
          });
          return;
        }
        callback({ success: false, error: 'Unknown demo action' });
      }
    }
  };
}
