(function initNeutralino() {
  const w = window as any;
  if (typeof w.Neutralino !== 'undefined' && typeof w.Neutralino.init === 'function') {
    try {
      w.Neutralino.init();
      w.Neutralino.events.on('windowClose', () => {
        w.Neutralino.app.exit();
      });
    } catch {}
  }
})();
