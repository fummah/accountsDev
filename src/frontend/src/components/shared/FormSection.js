import React from 'react';
import { Row, Col } from 'antd';

/**
 * FormSection — the ONE section-card wrapper used by every sectioned form, plus
 * the small layout kit that goes with it (FormGrid / FormCol / DocumentActionBar
 * / TotalsBlock).
 *
 * This module is the single source of AccuLedger's "boxed form" language. Every
 * create/edit screen (Customer, Vendor, Invoice, Quote, Bill, …) composes these
 * pieces so the boxes can never drift apart visually.
 *
 * Visual contract:
 *   • subtle 1px border + small radius + compact padding
 *   • compact UPPERCASE heading with an optional small icon
 *   • heading separated from the fields by a hairline rule
 *   • no oversized cards, no large empty areas
 *
 * It is presentation-only: it renders plain <div>s, so it never interferes with
 * label↔input association, tab order, Form.Item registration or validation
 * message placement. Nothing here holds state, so wrapping fields in sections
 * cannot unmount/remount them and cannot unregister a field.
 */

/** Compact vertical rhythm for fields inside a section (antd's default is 24px). */
export const FORM_ITEM_STYLE = { marginBottom: 12 };

/**
 * Body style for a Modal that hosts a sectioned form.
 *
 * Keeps the modal header and the footer (Cancel / Create …) fixed while only
 * the form body scrolls, so the primary action stays reachable on short
 * screens. The modal itself stays centred; only its content scrolls.
 */
export const MODAL_BODY_SCROLL_STYLE = {
  maxHeight: 'calc(100vh - 240px)',
  overflowY: 'auto',
  paddingTop: 16,
  paddingBottom: 4,
};

/** Standard width for the Customer / Vendor modals (700–850px band). */
export const MODAL_WIDTH = 780;

/**
 * Page shell for full-page create/edit forms (Invoice, Quote, Bill).
 *
 * Uses more of the desktop width than a modal while still capping the line
 * length so fields do not stretch absurdly on ultra-wide monitors.
 */
export const PAGE_MAX_WIDTH = 1280;
export const PAGE_WRAPPER_STYLE = {
  padding: 24,
  maxWidth: PAGE_MAX_WIDTH,
  margin: '0 auto',
};

/**
 * Row/Col gutter used inside sections. Kept in one place so every form's field
 * spacing matches.
 */
export const FORM_GUTTER = 16;

const sectionStyle = {
  // Slightly stronger neutral outline than the old #f0f0f0 so every section is
  // clearly defined without looking heavy. Defined as a CSS token (custom.css)
  // so the whole app changes in one place; the fallback keeps the section
  // bordered even if the stylesheet has not loaded.
  border: '1px solid var(--al-form-section-border, #d9d9d9)',
  borderRadius: 8,
  padding: '12px 16px 2px',
  marginBottom: 12,
  background: '#fff',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#595959',
  lineHeight: '18px',
  marginBottom: 12,
  paddingBottom: 8,
  // Kept one step lighter than the outer outline (never heavier).
  borderBottom: '1px solid var(--al-form-section-divider, #e8e8e8)',
};

const iconStyle = { fontSize: 13, color: '#8c8c8c', display: 'inline-flex', alignItems: 'center' };

const FormSection = ({ title, icon, extra, children, style, bodyStyle }) => (
  <div className="al-form-section" style={{ ...sectionStyle, ...(style || {}) }}>
    {title ? (
      <div className="al-form-section-header" style={headerStyle}>
        {icon ? <span style={iconStyle}>{icon}</span> : null}
        <span>{title}</span>
        {extra ? (
          <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: '#8c8c8c' }}>
            {extra}
          </span>
        ) : null}
      </div>
    ) : null}
    <div className="al-form-section-body" style={bodyStyle}>{children}</div>
  </div>
);

/**
 * FormGrid — a responsive grid of form fields.
 *
 * Desktop: `columns` across (default 3). Tablet: 2. Mobile: 1.
 * Never produces horizontal scrolling.
 *
 * IMPORTANT: this is a real antd <Row>, so it needs `.ant-row` to be a *row*
 * flex container. The vendored Jumbo theme used to force
 * `.ant-form-vertical .ant-row { flex-direction: column }`, which collapsed
 * every grid inside a vertical form into a stack — see public/css/custom.css,
 * which restores `flex-direction: row`, and scripts/verify-form-field-grid.js,
 * which guards it.
 */
export const FormGrid = ({ children, gutter = FORM_GUTTER, style }) => (
  <Row gutter={gutter} style={style}>
    {children}
  </Row>
);

/**
 * FormCol — one cell of a FormGrid.
 *
 * `span` is measured in "columns of the desktop grid" (1..`columns`), so a form
 * only has to say how wide a field should be relative to its neighbours:
 *
 *   <FormGrid>
 *     <FormCol>…</FormCol>        // 1/3 desktop, 1/2 tablet, full mobile
 *     <FormCol span={2}>…</FormCol> // 2/3 desktop, full tablet, full mobile
 *     <FormCol span={3}>…</FormCol> // full width at every breakpoint
 *   </FormGrid>
 */
export const FormCol = ({ span = 1, columns = 3, children, style }) => {
  const lg = Math.max(1, Math.round((24 * span) / columns));
  const md = span >= 2 ? 24 : 12;
  return (
    <Col xs={24} md={md} lg={lg} style={style}>
      {children}
    </Col>
  );
};

/**
 * DocumentActionBar — the footer strip of a document form.
 *
 * Secondary/dismissive actions (Cancel) sit on the left, primary actions
 * (Save, Save & Email) on the right, so the destructive option is never
 * adjacent to the primary one.
 */
export const DocumentActionBar = ({ left, children, style }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 12,
      ...(style || {}),
    }}
  >
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{left}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
      {children}
    </div>
  </div>
);

/**
 * TotalsBlock — right-aligned label/value rows for document totals.
 *
 * Presentation only: it renders whatever values it is given, so callers keep
 * using the existing calculations. `rows` entries are
 * `{ label, value, strong, color }`; falsy entries are skipped so callers can
 * conditionally include a row inline.
 */
export const TotalsBlock = ({ rows = [], minWidth = 260, style }) => (
  <div style={{ textAlign: 'right', minWidth, ...(style || {}) }}>
    {rows.filter(Boolean).map((r, i) => (
      <div
        key={r.key || i}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          lineHeight: '22px',
          fontSize: r.strong ? 15 : 13,
          fontWeight: r.strong ? 600 : 400,
          color: r.color || undefined,
        }}
      >
        <span style={{ color: r.color ? undefined : '#595959' }}>{r.label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
      </div>
    ))}
  </div>
);

/**
 * FormSection is exported BOTH ways on purpose:
 *   • `export default`        — the original consumers (CustomerContactFields,
 *                               SupplierVendorList, VendorCenter) import it bare.
 *   • `export { FormSection }` — the transactional forms import it by name
 *                               alongside the rest of the kit.
 * Both spellings must resolve or the production build fails with
 * "Attempted import error: 'FormSection' is not exported".
 */
export { FormSection };
export default FormSection;
