// Opens the coach in its own tab (a full tab gets a reliable microphone prompt, unlike popups/side panels).
// If the active tab is a Google Slides deck, the coach imports it straight away.

const GSLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/;

chrome.action.onClicked.addListener(async (tab) => {
  const m = tab.url && tab.url.match(GSLIDES);
  const url = chrome.runtime.getURL('app.html') + (m ? `?gslides=${m[1]}` : '');
  const [existing] = await chrome.tabs.query({ url: chrome.runtime.getURL('app.html') + '*' });
  if (existing && !m) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
});

// Download a Google Slides deck as PPTX using the user's existing Google session.
// Done here (not in the page) because the coach page is cross-origin isolated.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'fetchGoogleSlides') return;
  (async () => {
    try {
      const res = await fetch(`https://docs.google.com/presentation/d/${msg.id}/export/pptx`, { credentials: 'include' });
      const type = res.headers.get('content-type') || '';
      if (!res.ok || type.includes('text/html')) throw new Error(`Google returned ${res.status}. Are you signed in and allowed to download this deck?`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      sendResponse({ ok: true, base64: btoa(bin) });
    } catch (err) {
      sendResponse({ ok: false, error: String(err.message || err) });
    }
  })();
  return true; // async response
});
