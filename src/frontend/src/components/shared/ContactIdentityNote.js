import React from 'react';
import { IDENTITY_REQUIRED_MESSAGE } from '../../utils/contactIdentity';

/**
 * The helper note that sits beside the First Name / Company fields.
 *
 * It replaces the misleading mandatory `*` that used to sit on First Name and
 * implied First Name specifically was required. Neither field is required on
 * its own — the requirement is the PAIR — so the honest way to say it is a
 * note under the row rather than an asterisk on one field.
 *
 * The text is the shared constant, so this note, the field error, and the
 * message the backend returns are all the same string.
 */
const ContactIdentityNote = ({ style, children }) => (
  <div
    style={{
      fontSize: 12,
      lineHeight: 1.5,
      color: 'rgba(0, 0, 0, 0.45)',
      margin: '-4px 0 12px',
      ...style,
    }}
  >
    {children || IDENTITY_REQUIRED_MESSAGE}
  </div>
);

export default ContactIdentityNote;
