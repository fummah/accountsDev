/**
 * Shared z-index scale for the application's overlay layers.
 *
 * antd's own modal layer starts at 1000. The app raises its dialogs to 1050 so
 * they sit above the antd defaults; anything opened FROM INSIDE a dialog (a
 * nested dialog, or a confirmation) must clear that, otherwise it renders
 * behind the dialog that spawned it — the classic "confirm dialog hidden behind
 * the modal" bug.
 *
 * Use these tokens instead of scattering magic numbers like 999999 around:
 *   Z.MODAL         — a normal application dialog / drawer
 *   Z.NESTED_MODAL  — a dialog opened from within another dialog
 *   Z.CONFIRM       — a confirmation (Modal.confirm) that must top every dialog
 */
export const Z = {
  MODAL: 1050,
  NESTED_MODAL: 1100,
  CONFIRM: 1200,
};

export default Z;
