"use client";

import { MessageCircle, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const chatUrl =
  "https://wa.me/51994358300?text=Hola%20Reludcir%2C%20quisiera%20informaci%C3%B3n%20sobre%20un%20servicio%20de%20limpieza.";

export function WhatsAppWidget() {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const interacted = useRef(false);

  useEffect(() => {
    const buttonTimer = window.setTimeout(() => setVisible(true), 3_000);
    const messageTimer = window.setTimeout(() => {
      setVisible(true);
      if (!interacted.current) setOpen(true);
    }, 10_000);
    return () => {
      window.clearTimeout(buttonTimer);
      window.clearTimeout(messageTimer);
    };
  }, []);

  if (!visible) return null;

  if (!open) {
    return (
      <button
        className="whatsAppBubble"
        type="button"
        onClick={() => {
          interacted.current = true;
          setOpen(true);
        }}
        aria-label="Abrir chat de WhatsApp"
      >
        <MessageCircle aria-hidden="true" />
      </button>
    );
  }

  return (
    <aside className="whatsAppPanel" aria-label="Contacto por WhatsApp">
      <div className="whatsAppHeading">
        <strong>¿Hablamos por WhtasApp?</strong>
        <button
          type="button"
          onClick={() => {
            interacted.current = true;
            setOpen(false);
          }}
          aria-label="Cerrar chat"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div className="whatsAppBody">
        <details className="whatsAppQr">
          <summary>Escanea el código</summary>
          <Image
            src="/assets/whatsapp-qr.svg"
            alt="Código QR para abrir WhatsApp de Reludcir"
            width={175}
            height={175}
          />
        </details>
        <p>Hola, escríbenos por whatsapp desde aquí</p>
        <a href={chatUrl} target="_blank" rel="noreferrer">
          Abrir chat <MessageCircle aria-hidden="true" />
        </a>
      </div>
    </aside>
  );
}
