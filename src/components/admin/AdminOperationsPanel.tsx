"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { AdminPaymentsPanel } from "@/components/admin/AdminPaymentsPanel";
import { canAccessAdminSection, type AdminSection } from "@/lib/staff";

import styles from "./admin.module.css";

type Section = AdminSection;

type BookingRow = {
  id: number;
  status: string;
  bookingMode: string;
  recurrenceGroupId: string | null;
  scheduledStart: string;
  districtName: string;
  orderReference: string;
  customerName: string;
  customerEmail: string;
  paymentProvider: string | null;
  paymentStatus: string | null;
  paymentAmount: string | null;
  agentId: number | null;
  serviceNameSnapshot: string;
};

type AgentRow = { id: number; name: string; profession: string; isActive: boolean; avatarUrl: string | null };
type CustomerRow = { id: number; name: string; email: string; isActive: boolean; bookingsCount: number };
type StaffRow = { id: number; email: string; role: string; isActive: boolean; firstName: string | null; lastName: string | null };
type DistrictRow = { id: number; name: string; isActive: boolean };
type PackageRow = { id: number; name: string; oneTimePrice: string; recurringPrice: string | null };
type OccupancyRow = { bookingId: number; scheduledStart: string; scheduledEnd: string; districtName: string; agentName: string; status: string };
type CustomerBookingRow = { id: number; status: string; scheduledStart: string; serviceNameSnapshot: string; totalPriceSnapshot: string; currency: string };

const weekDayOptions = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" },
] as const;

const bookingStatusOptions = [
  { value: "", label: "Todos los estados" },
  { value: "pending_payment", label: "Pendiente de pago" },
  { value: "confirmed", label: "Confirmada" },
  { value: "assigned", label: "Asignada" },
  { value: "in_progress", label: "En curso" },
  { value: "completed", label: "Completada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No se presentó" },
] as const;

const paymentStatusOptions = [
  { value: "", label: "Todos los pagos" },
  { value: "pending", label: "Pendiente" },
  { value: "paid", label: "Pagado" },
  { value: "requires_action", label: "Requiere acción" },
  { value: "failed", label: "Fallido" },
  { value: "refunded", label: "Reembolsado" },
  { value: "partially_refunded", label: "Reembolso parcial" },
  { value: "cancelled", label: "Cancelado" },
] as const;

const sections: Array<{ id: Section; label: string }> = [
  { id: "bookings", label: "Reservas" },
  { id: "agents", label: "Personal" },
  { id: "customers", label: "Clientes" },
  { id: "payments", label: "Pagos" },
  { id: "catalog", label: "Catálogo" },
  { id: "calendar", label: "Calendario" },
  { id: "staff", label: "Equipo" },
];

function errorMessage(payload: { error?: string | { message?: string } } | null, fallback: string) {
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error.message === "string") return payload.error.message;
  return fallback;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className={styles.fieldLabel}>{children}</label>;
}

function Th({ children }: { children?: ReactNode }) {
  return <th className={styles.th}>{children}</th>;
}

function Td({ children }: { children?: ReactNode }) {
  return <td className={styles.td}>{children}</td>;
}

export function AdminOperationsPanel({
  role,
}: {
  role: string;
}) {
  const visibleSections = useMemo(
    () => sections.filter((section) => canAccessAdminSection(role, section.id)),
    [role],
  );
  const [section, setSection] = useState<Section>(visibleSections[0]?.id ?? "payments");
  const [message, setMessage] = useState("");
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [customerBookings, setCustomerBookings] = useState<CustomerBookingRow[]>([]);

  const occupancyByDay = useMemo(() => {
    const groups = new Map<string, OccupancyRow[]>();
    for (const row of occupancy) {
      const day = new Date(row.scheduledStart).toLocaleDateString("es-PE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        timeZone: "America/Lima",
      });
      groups.set(day, [...(groups.get(day) ?? []), row]);
    }
    return [...groups.entries()];
  }, [occupancy]);

  const loadLookups = useCallback(async () => {
    const [agentsResponse, catalogResponse] = await Promise.all([
      fetch("/api/v1/admin/agents", { credentials: "include" }),
      fetch("/api/v1/admin/catalog", { credentials: "include" }),
    ]);
    const agentsPayload = await agentsResponse.json();
    const catalogPayload = await catalogResponse.json();
    if (agentsResponse.ok) setAgents(agentsPayload.agents ?? []);
    if (catalogResponse.ok) {
      setDistricts(catalogPayload.districts ?? []);
      setPackages(catalogPayload.packages ?? []);
    }
  }, []);

  const loadSection = useCallback(async (current: Section) => {
    setMessage("");
    try {
      if (current === "bookings") {
        await loadLookups();
        const response = await fetch("/api/v1/admin/bookings", { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "No pudimos cargar reservas."));
        setBookings(payload.bookings ?? []);
      }
      if (current === "agents") {
        await loadLookups();
      }
      if (current === "customers") {
        const response = await fetch("/api/v1/admin/customers", { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "No pudimos cargar clientes."));
        setCustomers(payload.customers ?? []);
      }
      if (current === "catalog") {
        const response = await fetch("/api/v1/admin/catalog", { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "No pudimos cargar el catálogo."));
        setDistricts(payload.districts ?? []);
        setPackages(payload.packages ?? []);
      }
      if (current === "calendar") {
        await loadLookups();
        const response = await fetch("/api/v1/admin/calendar", { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "No pudimos cargar el calendario."));
        setOccupancy(payload.occupancy ?? []);
      }
      if (current === "staff") {
        const response = await fetch("/api/v1/admin/staff-users", { credentials: "include" });
        const payload = await response.json();
        if (!response.ok) throw new Error(errorMessage(payload, "No pudimos cargar el equipo."));
        setStaff(payload.staff ?? []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error de carga.");
    }
  }, [loadLookups]);

  useEffect(() => {
    const requestId = window.setTimeout(() => {
      void loadSection(section);
    }, 0);
    return () => window.clearTimeout(requestId);
  }, [loadSection, section]);

  async function patchBooking(id: number, body: Record<string, unknown>) {
    const response = await fetch(`/api/v1/admin/bookings/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(errorMessage(payload, "No pudimos actualizar la reserva."));
    await loadSection("bookings");
  }

  async function filterBookings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const params = new URLSearchParams();
    for (const key of ["status", "districtId", "agentId", "payment", "from", "to"]) {
      const value = String(form.get(key) ?? "").trim();
      if (value) params.set(key, value);
    }
    const response = await fetch(`/api/v1/admin/bookings?${params}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos filtrar."));
      return;
    }
    setBookings(payload.bookings ?? []);
  }

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/agents", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
        profession: String(form.get("profession") ?? "Agente de Limpieza"),
        avatarUrl: String(form.get("avatarUrl") ?? "") || undefined,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos crear el agente."));
      return;
    }
    event.currentTarget.reset();
    await loadSection("agents");
  }

  async function toggleAgent(id: number, isActive: boolean) {
    await fetch(`/api/v1/admin/agents/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await loadSection("agents");
  }

  async function blockAgent(event: FormEvent<HTMLFormElement>, id: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const startsAt = String(form.get("startsAt") ?? "");
    const endsAt = String(form.get("endsAt") ?? "");
    const response = await fetch(`/api/v1/admin/agents/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exception: {
          startsAt: startsAt ? new Date(startsAt).toISOString() : undefined,
          endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
          reason: String(form.get("reason") ?? "") || undefined,
        },
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos bloquear la fecha."));
      return;
    }
    setMessage("Bloqueo de agenda registrado.");
  }

  async function openCustomer(id: number) {
    const response = await fetch(`/api/v1/admin/customers/${id}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos cargar las reservas del cliente."));
      return;
    }
    setSelectedCustomer(id);
    setCustomerBookings(payload.bookings ?? []);
  }

  async function deactivateCustomer(id: number, isActive: boolean) {
    await fetch(`/api/v1/admin/customers/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await loadSection("customers");
  }

  async function saveCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const districtUpdates = districts.map((district) => ({
      id: district.id,
      isActive: form.get(`district-${district.id}`) === "on",
    }));
    const packageUpdates = packages.map((item) => ({
      id: item.id,
      oneTimePrice: String(form.get(`one-${item.id}`) ?? item.oneTimePrice),
      recurringPrice: String(form.get(`rec-${item.id}`) ?? item.recurringPrice ?? item.oneTimePrice),
    }));
    const response = await fetch("/api/v1/admin/catalog", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ districts: districtUpdates, packages: packageUpdates }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos guardar el catálogo."));
      return;
    }
    setMessage("Catálogo actualizado. El servicio empresas sigue próximamente.");
    await loadSection("catalog");
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/staff-users", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        role: String(form.get("role") ?? "support"),
        firstName: String(form.get("firstName") ?? ""),
        lastName: String(form.get("lastName") ?? ""),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setMessage(errorMessage(payload, "No pudimos crear el usuario interno."));
      return;
    }
    event.currentTarget.reset();
    await loadSection("staff");
  }

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.muted}>Operaciones Reludcir</p>
          <h1 className={styles.title}>Panel de administración</h1>
          <p className={styles.lede}>
            Gestiona reservas, personal, clientes, pagos y catálogo desde un solo lugar.
          </p>
        </div>
        <Link className={styles.secondary} href="/mis-reservas">
          Mis reservas
        </Link>
      </header>

      <nav className={styles.nav} aria-label="Secciones de administración">
        {visibleSections.map((item) => (
          <button
            key={item.id}
            type="button"
            className={section === item.id ? styles.navButtonActive : styles.navButton}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {message ? <p className={styles.alert}>{message}</p> : null}

      {section === "payments" ? <AdminPaymentsPanel embedded /> : null}

      {section === "bookings" ? (
        <div>
          <form className={styles.filters} onSubmit={filterBookings}>
            <FieldLabel>
              Estado
              <select className={styles.fieldControl} name="status" defaultValue="">
                {bookingStatusOptions.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              Distrito
              <select className={styles.fieldControl} name="districtId" defaultValue="">
                <option value="">Todos</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              Agente
              <select className={styles.fieldControl} name="agentId" defaultValue="">
                <option value="">Todos</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              Pago
              <select className={styles.fieldControl} name="payment" defaultValue="">
                {paymentStatusOptions.map((option) => (
                  <option key={option.value || "all-pay"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel>
              Desde
              <input className={styles.fieldControl} name="from" type="date" />
            </FieldLabel>
            <FieldLabel>
              Hasta
              <input className={styles.fieldControl} name="to" type="date" />
            </FieldLabel>
            <button className={styles.button} type="submit">
              Filtrar
            </button>
          </form>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Cliente</Th>
                  <Th>Visita</Th>
                  <Th>Estado / pago</Th>
                  <Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <Td>
                      {booking.orderReference}
                      <br />
                      <span className={styles.muted}>
                        {booking.bookingMode === "recurring" ? "Serie" : "Única"} · {booking.districtName}
                      </span>
                    </Td>
                    <Td>
                      {booking.customerName}
                      <br />
                      <span className={styles.muted}>{booking.customerEmail}</span>
                    </Td>
                    <Td>
                      {new Date(booking.scheduledStart).toLocaleString("es-PE")}
                      <br />
                      {booking.serviceNameSnapshot}
                    </Td>
                    <Td>
                      {booking.status}
                      <br />
                      {booking.paymentProvider ?? "—"} {booking.paymentStatus ?? ""}
                    </Td>
                    <Td>
                      <button className={styles.secondary} type="button" onClick={() => setSelectedBooking(booking.id)}>
                        Detalle
                      </button>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
                          void patchBooking(booking.id, { action: "cancel", reason }).catch((error) =>
                            setMessage(error instanceof Error ? error.message : "Error"),
                          );
                        }}
                      >
                        <input name="reason" placeholder="Motivo cancelación" required />
                        <button className={styles.secondary} type="submit">
                          Cancelar
                        </button>
                      </form>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const scheduledStart = String(new FormData(event.currentTarget).get("scheduledStart") ?? "");
                          void patchBooking(booking.id, {
                            action: "reschedule",
                            scheduledStart: scheduledStart ? new Date(scheduledStart).toISOString() : "",
                          }).catch((error) => setMessage(error instanceof Error ? error.message : "Error"));
                        }}
                      >
                        <input name="scheduledStart" type="datetime-local" required />
                        <button className={styles.secondary} type="submit">
                          Reprogramar
                        </button>
                      </form>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const agentId = Number(new FormData(event.currentTarget).get("agentId"));
                          void patchBooking(booking.id, { action: "assign", agentId }).catch((error) =>
                            setMessage(error instanceof Error ? error.message : "Error"),
                          );
                        }}
                      >
                        <select className={styles.fieldControl} name="agentId" defaultValue={booking.agentId ?? ""} required>
                          <option value="" disabled>
                            Elegir agente
                          </option>
                          {agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                        <button className={styles.secondary} type="submit">
                          Asignar
                        </button>
                      </form>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const form = new FormData(event.currentTarget);
                          void patchBooking(booking.id, {
                            action: "incident",
                            type: "other",
                            description: String(form.get("description") ?? ""),
                          }).catch((error) => setMessage(error instanceof Error ? error.message : "Error"));
                        }}
                      >
                        <input name="description" placeholder="Nota de incidencia" required />
                        <button className={styles.secondary} type="submit">
                          Nota
                        </button>
                      </form>
                      {selectedBooking === booking.id ? (
                        <p className={styles.ok}>ID {booking.id} · grupo {booking.recurrenceGroupId ?? "n/a"}</p>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {section === "agents" ? (
        <div>
          <form className={styles.form} onSubmit={createAgent}>
            <FieldLabel>
              Nombre
              <input className={styles.fieldControl} name="firstName" required />
            </FieldLabel>
            <FieldLabel>
              Apellido
              <input className={styles.fieldControl} name="lastName" />
            </FieldLabel>
            <FieldLabel>
              Profesión
              <input className={styles.fieldControl} name="profession" defaultValue="Agente de Limpieza" />
            </FieldLabel>
            <FieldLabel>
              Foto URL
              <input className={styles.fieldControl} name="avatarUrl" />
            </FieldLabel>
            <button className={styles.button} type="submit">
              Crear agente
            </button>
          </form>
          {agents.map((agent) => (
            <article className={styles.card} key={agent.id}>
              <strong>
                #{agent.id} {agent.name}
              </strong>
              <p className={styles.muted}>
                {agent.profession} · {agent.isActive ? "Activo" : "Inactivo"}
              </p>
              <button className={styles.secondary} type="button" onClick={() => toggleAgent(agent.id, !agent.isActive)}>
                {agent.isActive ? "Desactivar" : "Activar"}
              </button>
              <form
                className={styles.form}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const response = await fetch(`/api/v1/admin/agents/${agent.id}`, {
                    method: "PATCH",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      availability: [
                        {
                          districtId: Number(form.get("districtId")),
                          dayOfWeek: Number(form.get("dayOfWeek")),
                          startsAt: String(form.get("startsAt") || "07:00"),
                          endsAt: String(form.get("endsAt") || "19:00"),
                        },
                      ],
                    }),
                  });
                  const payload = await response.json();
                  if (!response.ok) {
                    setMessage(errorMessage(payload, "No pudimos guardar la disponibilidad."));
                    return;
                  }
                  setMessage("Disponibilidad semanal actualizada.");
                }}
              >
                <FieldLabel>
                  Distrito
                  <select className={styles.fieldControl} name="districtId" required defaultValue="">
                    <option value="" disabled>
                      Elegir distrito
                    </option>
                    {districts.map((district) => (
                      <option key={district.id} value={district.id}>
                        {district.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel>
                  Día
                  <select className={styles.fieldControl} name="dayOfWeek" required defaultValue="">
                    <option value="" disabled>
                      Elegir día
                    </option>
                    {weekDayOptions.map((day) => (
                      <option key={day.id} value={day.id}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel>
                  Desde
                  <input className={styles.fieldControl} name="startsAt" defaultValue="07:00" />
                </FieldLabel>
                <FieldLabel>
                  Hasta
                  <input className={styles.fieldControl} name="endsAt" defaultValue="19:00" />
                </FieldLabel>
                <button className={styles.secondary} type="submit">
                  Guardar horario
                </button>
              </form>
              <form className={styles.form} onSubmit={(event) => blockAgent(event, agent.id)}>
                <FieldLabel>
                  Bloquear desde
                  <input className={styles.fieldControl} name="startsAt" type="datetime-local" required />
                </FieldLabel>
                <FieldLabel>
                  Hasta
                  <input className={styles.fieldControl} name="endsAt" type="datetime-local" required />
                </FieldLabel>
                <FieldLabel>
                  Motivo
                  <input className={styles.fieldControl} name="reason" />
                </FieldLabel>
                <button className={styles.secondary} type="submit">
                  Bloquear fechas
                </button>
              </form>
            </article>
          ))}
        </div>
      ) : null}

      {section === "customers" ? (
        <div>
        <div className={styles.tableWrap}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Reservas</Th>
                <Th>Estado</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <Td>
                    {customer.name}
                    <br />
                    <span className={styles.muted}>{customer.email}</span>
                  </Td>
                  <Td>{customer.bookingsCount}</Td>
                  <Td>{customer.isActive ? "Activo" : "Inactivo"}</Td>
                  <Td>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => void openCustomer(customer.id)}
                    >
                      Ver reservas
                    </button>
                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={() => deactivateCustomer(customer.id, !customer.isActive)}
                    >
                      {customer.isActive ? "Desactivar" : "Activar"}
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedCustomer ? (
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>
              Reservas del cliente #{selectedCustomer}
            </h2>
            {customerBookings.length === 0 ? (
              <p className={styles.muted}>Este cliente no tiene reservas ligadas a la cuenta.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.dataTable}>
                  <thead>
                    <tr>
                      <Th>Visita</Th>
                      <Th>Servicio</Th>
                      <Th>Estado</Th>
                      <Th>Importe</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerBookings.map((booking) => (
                      <tr key={booking.id}>
                        <Td>{new Date(booking.scheduledStart).toLocaleString("es-PE")}</Td>
                        <Td>{booking.serviceNameSnapshot}</Td>
                        <Td>{booking.status}</Td>
                        <Td>
                          {booking.totalPriceSnapshot} {booking.currency}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
        </div>
      ) : null}

      {section === "catalog" ? (
        <form onSubmit={saveCatalog}>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Distritos</h2>
            {districts.map((district) => (
              <label className={styles.checkLabel} key={district.id}>
                <input name={`district-${district.id}`} type="checkbox" defaultChecked={district.isActive} /> {district.name}
              </label>
            ))}
          </div>
          <div className={styles.card}>
            <h2 className={styles.sectionTitle}>Paquetes 4/6/8 horas</h2>
            {packages.map((item) => (
              <div className={styles.form} key={item.id}>
                <strong>{item.name}</strong>
                <FieldLabel>
                  Único
                  <input className={styles.fieldControl} name={`one-${item.id}`} defaultValue={item.oneTimePrice} />
                </FieldLabel>
                <FieldLabel>
                  Recurrente
                  <input className={styles.fieldControl} name={`rec-${item.id}`} defaultValue={item.recurringPrice ?? ""} />
                </FieldLabel>
              </div>
            ))}
            <p className={styles.muted}>Limpieza para empresas permanece como «próximamente».</p>
          </div>
          <button className={styles.button} type="submit">
            Guardar catálogo
          </button>
        </form>
      ) : null}

      {section === "calendar" ? (
        <div>
          <form
            className={styles.filters}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const params = new URLSearchParams();
              for (const key of ["from", "to", "agentId"]) {
                const value = String(form.get(key) ?? "").trim();
                if (value) params.set(key, value);
              }
              const response = await fetch(`/api/v1/admin/calendar?${params}`, {
                credentials: "include",
              });
              const payload = await response.json();
              if (!response.ok) {
                setMessage(errorMessage(payload, "No pudimos filtrar el calendario."));
                return;
              }
              setOccupancy(payload.occupancy ?? []);
            }}
          >
            <FieldLabel>
              Desde
              <input className={styles.fieldControl} name="from" type="date" />
            </FieldLabel>
            <FieldLabel>
              Hasta
              <input className={styles.fieldControl} name="to" type="date" />
            </FieldLabel>
            <FieldLabel>
              Agente
              <select className={styles.fieldControl} name="agentId" defaultValue="">
                <option value="">Todos</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <button className={styles.button} type="submit">
              Ver ocupación
            </button>
          </form>
          {occupancyByDay.length === 0 ? (
            <p className={styles.muted}>No hay visitas en el rango seleccionado.</p>
          ) : (
            occupancyByDay.map(([day, rows]) => (
              <div className={styles.card} key={day}>
                <h2 className={styles.sectionTitle}>{day}</h2>
                <div className={styles.tableWrap}>
                  <table className={styles.dataTable}>
                    <thead>
                      <tr>
                        <Th>Inicio</Th>
                        <Th>Fin</Th>
                        <Th>Agente</Th>
                        <Th>Distrito</Th>
                        <Th>Estado</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={`${row.bookingId}-${row.scheduledStart}`}>
                          <Td>{new Date(row.scheduledStart).toLocaleString("es-PE")}</Td>
                          <Td>{new Date(row.scheduledEnd).toLocaleString("es-PE")}</Td>
                          <Td>{row.agentName}</Td>
                          <Td>{row.districtName}</Td>
                          <Td>{row.status}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {section === "staff" ? (
        <div>
          <form className={styles.form} onSubmit={createStaff}>
            <FieldLabel>
              Nombre
              <input className={styles.fieldControl} name="firstName" required />
            </FieldLabel>
            <FieldLabel>
              Apellido
              <input className={styles.fieldControl} name="lastName" required />
            </FieldLabel>
            <FieldLabel>
              Correo
              <input className={styles.fieldControl} name="email" type="email" required />
            </FieldLabel>
            <FieldLabel>
              Contraseña
              <input className={styles.fieldControl} name="password" type="password" minLength={8} required />
            </FieldLabel>
            <FieldLabel>
              Rol
              <select className={styles.fieldControl} name="role" defaultValue="support">
                <option value="admin">admin</option>
                <option value="support">support</option>
              </select>
            </FieldLabel>
            <button className={styles.button} type="submit">
              Crear usuario interno
            </button>
          </form>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <Th>Correo</Th>
                  <Th>Rol</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {staff.map((user) => (
                  <tr key={user.id}>
                    <Td>{user.email}</Td>
                    <Td>{user.role}</Td>
                    <Td>{user.isActive ? "Activo" : "Inactivo"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
