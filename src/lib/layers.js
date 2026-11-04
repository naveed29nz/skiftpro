// Stacking for the sticky app chrome versus portaled UI.
// Dialogs render in a portal on document.body. They have to paint above the
// green demo bar, the navy header, and the mobile menu/logout buttons.
// Select menus and toasts portal on their own and stay above an open dialog.

export const APP_CHROME_Z = {
  header: 100,
  impersonation: 110,
  demoBar: 120,
  mobileControls: 9999,
};

export const DIALOG_Z = 10040;
export const SELECT_Z = 10060;
export const TOAST_Z = 10080;

export function maxAppChromeZ() {
  return Math.max(...Object.values(APP_CHROME_Z));
}
