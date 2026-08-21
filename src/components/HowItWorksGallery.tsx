"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const slides = [
  {
    src: "/assets/service-benefit-green.webp",
    alt: "Agenda la limpieza de tu casa en segundos",
  },
  { src: "/assets/how-step-pay.webp", alt: "Paga online tu reserva" },
  { src: "/assets/how-step-1.webp", alt: "Ingresa tus datos de contacto" },
  { src: "/assets/how-step-4.webp", alt: "Recibe el servicio en tu hogar" },
  { src: "/assets/how-step-2.webp", alt: "Elige al personal de limpieza" },
] as const;

export function HowItWorksGallery() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    const previousIndex = activeIndex;
    setActiveIndex(null);
    window.requestAnimationFrame(() => {
      if (previousIndex !== null) triggerRefs.current[previousIndex]?.focus();
    });
  }, [activeIndex]);

  const move = useCallback((direction: -1 | 1) => {
    setActiveIndex((current) => {
      if (current === null) return null;
      return (current + direction + slides.length) % slides.length;
    });
  }, []);

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, close, move]);

  return (
    <>
      <div className="howItWorks contentWidth" aria-label="Cómo funciona">
        <div className="howTitle">
          <span>¿Cómo funciona?</span>
          <i />
        </div>
        {slides.map((slide, index) => (
          <button
            className="howThumb"
            key={slide.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            ref={(element) => {
              triggerRefs.current[index] = element;
            }}
            aria-label={`Ampliar: ${slide.alt}`}
          >
            <Image src={slide.src} alt={slide.alt} width={177} height={100} />
          </button>
        ))}
      </div>

      {activeIndex !== null ? (
        <div
          className="galleryLightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Cómo funciona, imagen ${activeIndex + 1} de ${slides.length}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <button
            className="galleryLightboxClose"
            type="button"
            onClick={close}
            ref={closeRef}
            aria-label="Cerrar galería"
          >
            <X aria-hidden="true" />
          </button>
          <button
            className="galleryLightboxPrevious"
            type="button"
            onClick={() => move(-1)}
            aria-label="Imagen anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <figure>
            <Image
              src={slides[activeIndex].src}
              alt={slides[activeIndex].alt}
              width={1_200}
              height={680}
              priority
            />
            <figcaption>
              {slides[activeIndex].alt} · {activeIndex + 1}/{slides.length}
            </figcaption>
          </figure>
          <button
            className="galleryLightboxNext"
            type="button"
            onClick={() => move(1)}
            aria-label="Imagen siguiente"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
