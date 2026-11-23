/**
 * Non-blocking Telegram Bot alerts for the admin (configured via Vercel Env Vars:
 * TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID). Fails silently so it never blocks student orders.
 */
export async function sendTelegramAlert(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Non-fatal notification failure
  }
}
