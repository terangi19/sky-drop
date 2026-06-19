/**
 * Accessibility utilities for WCAG compliance
 */

/**
 * Generate a unique ID for form labels and their associated inputs
 */
export function generateAriaId(prefix: string = 'aria'): string {
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Check if an element has sufficient color contrast (simplified check)
 * For production, use a library like axe-core or color-contrast
 */
export function checkContrast(foreground: string, background: string): boolean {
  // This is a simplified check - in production use a proper contrast library
  const fgLuminance = getLuminance(foreground);
  const bgLuminance = getLuminance(background);
  const ratio = (Math.max(fgLuminance, bgLuminance) + 0.05) / (Math.min(fgLuminance, bgLuminance) + 0.05);
  return ratio >= 4.5; // WCAG AA standard for normal text
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  
  const [r, g, b] = rgb.map(val => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
}

/**
 * Generate ARIA attributes for form fields
 */
export function getFormAriaProps(
  id: string,
  label: string,
  error?: string,
  description?: string
) {
  return {
    id,
    'aria-label': label,
    'aria-invalid': !!error,
    'aria-describedby': error ? `${id}-error` : description ? `${id}-description` : undefined,
    'aria-required': true,
  };
}

/**
 * Generate ARIA attributes for modal dialogs
 */
export function getModalAriaProps(id: string, title: string) {
  return {
    id,
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': `${id}-title`,
    'aria-describedby': `${id}-description`,
  };
}

/**
 * Focus trap for modals - ensures keyboard navigation stays within modal
 */
export function trapFocus(element: HTMLElement): () => void {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0] as HTMLElement;
  const lastFocusable = focusableElements[focusableElements.length - 1] as HTMLElement;

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          lastFocusable.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          firstFocusable.focus();
          e.preventDefault();
        }
      }
    }
  }

  element.addEventListener('keydown', handleKeyDown);
  firstFocusable?.focus();

  return () => {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Announce screen reader messages
 */
export function announceToScreenReader(message: string): void {
  const announcement = document.createElement('div');
  announcement.setAttribute('role', 'status');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.style.position = 'absolute';
  announcement.style.left = '-10000px';
  announcement.style.width = '1px';
  announcement.style.height = '1px';
  announcement.style.overflow = 'hidden';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
}

/**
 * Skip to main content link for keyboard users
 */
export function createSkipLink(): HTMLElement {
  const link = document.createElement('a');
  link.href = '#main-content';
  link.textContent = 'Skip to main content';
  link.style.position = 'absolute';
  link.style.left = '-9999px';
  link.style.top = 'auto';
  link.style.width = '1px';
  link.style.height = '1px';
  link.style.overflow = 'hidden';
  link.style.zIndex = '9999';
  
  link.addEventListener('focus', () => {
    link.style.left = '10px';
    link.style.top = '10px';
    link.style.width = 'auto';
    link.style.height = 'auto';
    link.style.overflow = 'visible';
    link.style.padding = '10px';
    link.style.background = 'white';
    link.style.color = 'black';
  });
  
  link.addEventListener('blur', () => {
    link.style.left = '-9999px';
    link.style.top = 'auto';
    link.style.width = '1px';
    link.style.height = '1px';
    link.style.overflow = 'hidden';
  });
  
  return link;
}
