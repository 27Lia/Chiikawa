(function (): void {
  'use strict';

  function byId<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`element not found: ${id}`);
    }
    return el as T;
  }

  const dragEnabledEl = byId<HTMLInputElement>('dragEnabled');
  const reactionsEnabledEl = byId<HTMLInputElement>('reactionsEnabled');
  const autoWalkEnabledEl = byId<HTMLInputElement>('autoWalkEnabled');
  const cursorChaseEnabledEl = byId<HTMLInputElement>('cursorChaseEnabled');
  const pinModeDesktopEl = byId<HTMLInputElement>('pinModeDesktop');
  const pinModeTopEl = byId<HTMLInputElement>('pinModeTop');
  const accessibilityStatusEl = byId<HTMLParagraphElement>('accessibilityStatus');
  const requestPermissionBtn = byId<HTMLButtonElement>('requestPermissionBtn');

  const characterEls: Record<CharacterId, HTMLInputElement> = {
    chiikawa: byId<HTMLInputElement>('char-chiikawa'),
    hachiware: byId<HTMLInputElement>('char-hachiware'),
    usagi: byId<HTMLInputElement>('char-usagi'),
    momonga: byId<HTMLInputElement>('char-momonga'),
  };

  let applyingRemoteUpdate = false;

  function applySettings(settings: AppSettings): void {
    applyingRemoteUpdate = true;
    dragEnabledEl.checked = settings.dragEnabled;
    reactionsEnabledEl.checked = settings.reactionsEnabled;
    autoWalkEnabledEl.checked = settings.autoWalkEnabled;
    cursorChaseEnabledEl.checked = settings.cursorChaseEnabled;
    pinModeDesktopEl.checked = settings.pinMode === 'desktop';
    pinModeTopEl.checked = settings.pinMode === 'top';
    for (const id of Object.keys(characterEls) as CharacterId[]) {
      characterEls[id].checked = settings.characters[id];
    }
    applyingRemoteUpdate = false;
  }

  function applyAccessibilityStatus(granted: boolean): void {
    accessibilityStatusEl.textContent = granted
      ? '손쉬운 사용 권한이 허용되어 있어요.'
      : '권한이 없어서 커서를 끌고 가는 동작은 실제로 움직이지 않아요.';
    accessibilityStatusEl.className = 'status ' + (granted ? 'granted' : 'denied');
  }

  function sendUpdate(partial: Partial<AppSettings>): void {
    if (applyingRemoteUpdate) {
      return;
    }
    window.settingsAPI.updateSettings(partial);
  }

  dragEnabledEl.addEventListener('change', () => {
    sendUpdate({ dragEnabled: dragEnabledEl.checked });
  });
  reactionsEnabledEl.addEventListener('change', () => {
    sendUpdate({ reactionsEnabled: reactionsEnabledEl.checked });
  });
  autoWalkEnabledEl.addEventListener('change', () => {
    sendUpdate({ autoWalkEnabled: autoWalkEnabledEl.checked });
  });
  cursorChaseEnabledEl.addEventListener('change', () => {
    sendUpdate({ cursorChaseEnabled: cursorChaseEnabledEl.checked });
  });
  pinModeDesktopEl.addEventListener('change', () => {
    if (pinModeDesktopEl.checked) {
      sendUpdate({ pinMode: 'desktop' });
    }
  });
  pinModeTopEl.addEventListener('change', () => {
    if (pinModeTopEl.checked) {
      sendUpdate({ pinMode: 'top' });
    }
  });
  for (const id of Object.keys(characterEls) as CharacterId[]) {
    characterEls[id].addEventListener('change', () => {
      sendUpdate({ characters: { [id]: characterEls[id].checked } as Record<CharacterId, boolean> });
    });
  }

  requestPermissionBtn.addEventListener('click', () => {
    window.settingsAPI.requestAccessibilityPermission().then(applyAccessibilityStatus);
  });

  window.settingsAPI.onSettingsChanged(applySettings);
  window.settingsAPI.onAccessibilityStatus(applyAccessibilityStatus);
  window.settingsAPI.getSettings().then(applySettings);
  window.settingsAPI.getAccessibilityStatus().then(applyAccessibilityStatus);
})();
