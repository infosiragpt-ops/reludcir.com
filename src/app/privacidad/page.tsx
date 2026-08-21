import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description:
    "Conoce qué información utiliza Reludcir para gestionar cuentas, reservas y servicios de limpieza.",
};

export default function PrivacyPage() {
  return (
    <main className="content-page legal-page">
      <header className="page-hero legal-page__hero">
        <div className="content-shell content-shell--narrow">
          <h1>Política de privacidad</h1>
          <p>
            Esta política explica qué información usamos, para qué la usamos y qué opciones
            tienes cuando visitas Reludcir o reservas un servicio.
          </p>
          <p className="legal-page__updated">Última actualización: 11 de agosto de 2026.</p>
        </div>
      </header>

      <article className="page-section legal-content">
        <div className="content-shell content-shell--narrow">
          <section aria-labelledby="privacy-responsible">
            <h2 id="privacy-responsible">1. Responsable y contacto</h2>
            <p>
              Reludcir gestiona la información necesaria para operar esta plataforma. Si
              tienes preguntas sobre tus datos, escribe a{" "}
              <a href="mailto:info.reludcir@gmail.com">info.reludcir@gmail.com</a> o usa los{" "}
              <Link href="/contactar-con-servicios-de-limpieza">canales de contacto</Link>.
            </p>
          </section>

          <section aria-labelledby="privacy-data">
            <h2 id="privacy-data">2. Información que recopilamos</h2>
            <ul>
              <li>Datos de cuenta, como nombres, apellidos, correo y teléfono.</li>
              <li>
                Datos de la reserva, como servicio, fecha, horario, distrito, dirección e
                indicaciones necesarias para la atención.
              </li>
              <li>
                Estado del pago y referencias de la transacción. Reludcir no necesita
                almacenar el número completo de tu tarjeta.
              </li>
              <li>Mensajes, incidencias, cancelaciones, reprogramaciones y calificaciones.</li>
              <li>
                Información técnica y de navegación, como dispositivo, dirección IP,
                páginas visitadas y origen de la visita.
              </li>
            </ul>
          </section>

          <section aria-labelledby="privacy-purpose">
            <h2 id="privacy-purpose">3. Para qué utilizamos la información</h2>
            <ul>
              <li>Crear y proteger tu cuenta.</li>
              <li>Procesar, asignar y gestionar reservas.</li>
              <li>Validar la cobertura y dirección del servicio.</li>
              <li>Procesar pagos, devoluciones y comprobantes.</li>
              <li>Enviar confirmaciones, alertas y recordatorios.</li>
              <li>Atender consultas, incidencias y solicitudes de soporte.</li>
              <li>Prevenir fraude y mantener la seguridad de la plataforma.</li>
              <li>Medir y mejorar el sitio y nuestros servicios.</li>
            </ul>
          </section>

          <section aria-labelledby="privacy-providers">
            <h2 id="privacy-providers">4. Proveedores y destinatarios</h2>
            <p>
              Compartimos únicamente la información necesaria con el personal asignado y
              con proveedores que nos ayudan a operar pagos, mapas, correo, WhatsApp,
              alojamiento, analítica y soporte. Cada proveedor recibe solo los datos que
              necesita para prestar su función.
            </p>
          </section>

          <section aria-labelledby="privacy-retention">
            <h2 id="privacy-retention">5. Conservación y seguridad</h2>
            <p>
              Conservamos los datos mientras sean necesarios para gestionar la relación con
              el cliente, resolver reclamaciones y cumplir obligaciones legales. Aplicamos
              controles de acceso, cifrado y registros de auditoría adecuados al tipo de
              información tratada.
            </p>
          </section>

          <section aria-labelledby="privacy-rights">
            <h2 id="privacy-rights">6. Tus derechos</h2>
            <p>
              Puedes solicitar acceso, actualización, rectificación o eliminación de tus
              datos, así como retirar un consentimiento cuando corresponda. Para protegerte,
              podremos pedirte que confirmes tu identidad antes de atender la solicitud.
            </p>
          </section>

          <section aria-labelledby="privacy-cookies">
            <h2 id="privacy-cookies">7. Cookies y servicios externos</h2>
            <p>
              Usamos cookies necesarias para la sesión, la reserva y la seguridad. También
              podemos utilizar medición de audiencia. Al abrir enlaces como Google Maps,
              Calendly o redes sociales, se aplican además las políticas del servicio externo.
            </p>
          </section>

          <section aria-labelledby="privacy-updates">
            <h2 id="privacy-updates">8. Cambios a esta política</h2>
            <p>
              Podemos actualizar esta política cuando cambie la plataforma o la normativa.
              Publicaremos aquí la versión vigente y su fecha de actualización.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
