/**
 * Cross-browser / cross-OS clipboard helper.
 * Works on modern browsers, iOS Safari (including older versions),
 * Android Chrome, Samsung Internet, and Facebook/WhatsApp in-app WebViews.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Primary modern Clipboard API (requires HTTPS / secure context)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea method (common in iOS/Android WebViews)
    }
  }

  // Fallback compatible with older iOS Safari & Android WebViews
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    textarea.style.fontSize = "16px"; // Prevent iOS auto-zoom
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const prevRange =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (prevRange && selection) {
      selection.removeAllRanges();
      selection.addRange(prevRange);
    }
    return ok;
  } catch {
    return false;
  }
}
