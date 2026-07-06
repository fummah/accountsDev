/**
 * Shared phone formatting utility.
 *
 * formatPhone('1234567890')   => '(123) 456-7890'
 * formatPhone('11234567890')  => '+1 (123) 456-7890'
 * formatPhone('123456')       => '123456'  (too short — returned as-is)
 * formatPhone('')             => ''
 *
 * normalizePhone strips everything except digits and leading '+'.
 */

/**
 * Strip non-digit characters (keep leading +).
 */
export const normalizePhone = (value) => {
  if (!value) return '';
  const s = String(value).trim();
  const hasPlus = s.startsWith('+');
  const digits = s.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
};

/**
 * Format a phone number into a human-readable form.
 * Supports 10-digit US numbers and 11-digit with country code.
 * Everything else is returned as-is.
 */
export const formatPhone = (value) => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  // International or short — return cleaned with original formatting
  return String(value).trim();
};

/**
 * Ant Design-compatible input formatter.
 * Use as: <Input onChange={e => form.setFieldsValue({ phone: phoneInputHandler(e.target.value) })} />
 * Or use the onBlur approach to format on blur.
 */
export const phoneInputHandler = (value) => {
  const digits = (value || '').replace(/\D/g, '');
  // Auto-format as user types (10 digits)
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
};
