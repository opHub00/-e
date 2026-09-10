(() => {
  const PROMPT_READY_EVENT = 'wanpane:installpromptready';

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__wanpaneInstallPrompt = event;
    window.dispatchEvent(new Event(PROMPT_READY_EVENT));
  });

  window.addEventListener('appinstalled', () => {
    window.__wanpaneInstallPrompt = null;
    window.dispatchEvent(new Event(PROMPT_READY_EVENT));
  });

  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      await registration.update();
    } catch {
      // 앱 자체의 online 동작은 service worker 등록 실패와 독립적으로 유지한다.
    }
  };

  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
})();
