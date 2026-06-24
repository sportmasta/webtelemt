import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getConnectionLinks, getPrimaryConnectionLink, TelemtUser } from "../api";

export function ConnectionLinkBlock({ link, label }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="connection-link-block">
      {label && <span className="connection-link-label">{label}</span>}
      <div className="connection-link-row">
        <code className="connection-link-text">{link}</code>
        <button type="button" className="btn btn--sm" onClick={handleCopy}>
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <div className="connection-qr">
        <QRCodeSVG value={link} size={160} bgColor="#1a1d27" fgColor="#e8eaef" />
      </div>
    </div>
  );
}

export function ProfileConnectionLinks({ user }: { user: TelemtUser }) {
  const connectionLinks = getConnectionLinks(user);
  const primaryLink = getPrimaryConnectionLink(user);

  if (connectionLinks.length === 0) {
    return <p className="hint">Ссылка для подключения недоступна.</p>;
  }

  return (
    <>
      {primaryLink && <ConnectionLinkBlock link={primaryLink} label="Основная ссылка (TLS)" />}
      {connectionLinks.length > 1 && (
        <div className="connection-alt-links">
          <span className="connection-link-label">Дополнительные ссылки</span>
          {connectionLinks.slice(1).map((link) => (
            <ConnectionLinkBlock key={link} link={link} />
          ))}
        </div>
      )}
    </>
  );
}
