"use client";

/**
 * Floating WhatsApp + Telegram buttons, fixed to the bottom-right corner of the storefront
 * (excluded from admin routes by LayoutWrapper, same as Navbar/Footer). Both deep-link off the
 * same business phone number (COMPANY_PHONE) — WhatsApp via wa.me, Telegram via its phone-based
 * t.me/+<number> deep link (only works if that number is registered on Telegram with phone
 * lookup allowed in privacy settings; swap to a t.me/<username> link if/when one exists).
 */

// +44 7444 724389 → wa.me wants digits only (no +), Telegram wants a leading +.
const PHONE_DIGITS = "447444724389";

const WHATSAPP_URL = `https://wa.me/${PHONE_DIGITS}`;
const TELEGRAM_URL = `https://t.me/+${PHONE_DIGITS}`;

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
      <path d="M16.004 3C9.376 3 4 8.373 4 15c0 2.31.65 4.47 1.78 6.31L4 29l7.86-1.75A11.93 11.93 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3Zm0 21.75c-1.99 0-3.86-.55-5.46-1.5l-.39-.23-4.66 1.04 1.02-4.55-.25-.4A9.7 9.7 0 0 1 6.25 15c0-5.38 4.38-9.75 9.75-9.75S25.75 9.62 25.75 15 21.38 24.75 16 24.75Z" />
      <path d="M21.2 17.66c-.29-.15-1.73-.85-2-.95-.27-.1-.46-.15-.66.15-.2.29-.76.95-.93 1.15-.17.2-.34.22-.63.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.66-1.6-.91-2.19-.24-.58-.48-.5-.66-.51h-.56c-.2 0-.51.07-.78.37-.27.29-1.02.99-1.02 2.42s1.04 2.81 1.19 3c.15.2 2.05 3.13 4.97 4.39.69.3 1.24.48 1.66.61.7.22 1.34.19 1.84.12.56-.08 1.73-.71 1.98-1.39.24-.68.24-1.27.17-1.39-.07-.12-.27-.2-.56-.34Z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 32 32" width="26" height="26" fill="currentColor" aria-hidden="true">
      <path d="M16 3C8.82 3 3 8.82 3 16s5.82 13 13 13 13-5.82 13-13S23.18 3 16 3Zm6.13 8.86-2.1 9.9c-.16.71-.58.88-1.17.55l-3.24-2.39-1.56 1.5c-.17.17-.32.32-.65.32l.23-3.29 5.99-5.41c.26-.23-.06-.36-.4-.13l-7.4 4.66-3.19-1c-.69-.22-.71-.69.15-1.02l12.47-4.81c.58-.21 1.08.13.87 1.12Z" />
    </svg>
  );
}

export default function FloatingContactButtons() {
  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-3">
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        title="Chat on WhatsApp"
        className="w-14 h-14 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform duration-150"
      >
        <WhatsAppIcon />
      </a>
      <a
        href={TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Message us on Telegram"
        title="Message on Telegram"
        className="w-14 h-14 rounded-full bg-[#26A5E4] text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform duration-150"
      >
        <TelegramIcon />
      </a>
    </div>
  );
}
