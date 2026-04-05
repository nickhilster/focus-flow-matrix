export const MESSAGE_TYPES = {
  QUICK_ADD_TASK: 'focusFlow/quickAddTask',
  ACTIVATE_PANEL: 'focusFlow/activatePanel',
};

export function initMessageBridge({ addTaskFromQuickCapture, activatePanel }) {
  window.addEventListener('message', (event) => {
    const message = event.data || {};
    const { type, payload } = message;

    if (type === MESSAGE_TYPES.QUICK_ADD_TASK && typeof payload?.text === 'string') {
      addTaskFromQuickCapture(payload.text.trim());
      return;
    }

    if (type === MESSAGE_TYPES.ACTIVATE_PANEL && typeof payload?.panel === 'string') {
      activatePanel(payload.panel, true);
    }
  });
}
