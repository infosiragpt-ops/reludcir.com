"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  WalletCards,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  districts,
  packages,
  servicePlans,
  staffMembers,
  type District,
  type ServicePlan,
  type StaffMember,
} from "@/data/site";
import { buildRecurrenceOccurrences } from "@/lib/recurrence";

type CustomerForm = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address: string;
  interior: string;
};

type BookingResponse = {
  id?: string;
  confirmationCode?: string;
  confirmation_code?: string;
  visits?: number;
  total?: string;
  currency?: string;
  payment?: {
    method?: "card" | "yape" | "transfer";
    status?: string;
    checkoutUrl?: string;
    instructions?: string;
  };
  error?: string | { message?: string };
};

const singleStepLabels = [
  "Ubicación",
  "Servicios",
  "Fecha y hora",
  "Personal",
  "Información",
  "Revisa el pedido",
  "Confirmación",
] as const;

const recurringStepLabels = [
  "Ubicación",
  "Servicios",
  "Información recurrente",
  "Fecha y hora",
  "Personal",
  "Información",
  "Revisa el pedido",
  "Confirmación",
] as const;

const weekDays = [
  { id: 1, label: "Lunes" },
  { id: 2, label: "Martes" },
  { id: 3, label: "Miércoles" },
  { id: 4, label: "Jueves" },
  { id: 5, label: "Viernes" },
  { id: 6, label: "Sábado" },
  { id: 0, label: "Domingo" },
] as const;

const defaultCustomer: CustomerForm = {
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
  interior: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(value);
}

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 || 12;
  return `${normalized}:00 ${suffix}`;
}

function getMonthCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const firstDay = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  return [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: days }, (_, index) => new Date(year, monthIndex, index + 1)),
  ];
}

function addHoursToTime(time: string, hours: number) {
  const start = Number(time.split(":")[0]);
  return formatHour(start + hours);
}

export function BookingWizard() {
  const tomorrow = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    value.setDate(value.getDate() + 1);
    return value;
  }, []);
  const [step, setStep] = useState(1);
  const [district, setDistrict] = useState<District | null>(null);
  const [service, setService] = useState<ServicePlan | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(tomorrow.getFullYear(), tomorrow.getMonth(), 1),
  );
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [staff, setStaff] = useState<StaffMember | null>(null);
  const [customer, setCustomer] = useState<CustomerForm>(defaultCustomer);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "yape" | "transfer">(
    "card",
  );
  const [durationOpen, setDurationOpen] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);
  const [recurringTimes, setRecurringTimes] = useState<Record<number, string>>({});
  const [recurrenceStart, setRecurrenceStart] = useState(() => localIsoDate(tomorrow));
  const [recurrenceEnd, setRecurrenceEnd] = useState(() => {
    const end = new Date(tomorrow);
    end.setDate(end.getDate() + 30);
    return localIsoDate(end);
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState("");
  const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);
  const [availableStaffIds, setAvailableStaffIds] = useState<number[] | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [catalogDistricts, setCatalogDistricts] = useState(districts);
  const [catalogStaff, setCatalogStaff] = useState(staffMembers);
  const idempotencyKey = useRef("");
  const durationDialogRef = useRef<HTMLDivElement>(null);
  const durationTriggerRef = useRef<HTMLElement | null>(null);

  const isRecurring = service?.kind === "recurring";
  const activeStepLabels = isRecurring ? recurringStepLabels : singleStepLabels;
  const dateStep = isRecurring ? 4 : 3;
  const staffStep = isRecurring ? 5 : 4;
  const informationStep = isRecurring ? 6 : 5;
  const reviewStep = isRecurring ? 7 : 6;
  const confirmationStep = isRecurring ? 8 : 7;

  const chosenPackage = packages.find((item) => item.hours === duration);
  const unitPrice = chosenPackage
    ? service?.kind === "recurring"
      ? chosenPackage.recurringPrice
      : chosenPackage.singlePrice
    : 0;
  const recurringOccurrences = useMemo(
    () =>
      buildRecurrenceOccurrences({
        startsOn: recurrenceStart,
        endsOn: recurrenceEnd,
        times: recurringDays.map((dayOfWeek) => ({
          dayOfWeek,
          time: recurringTimes[dayOfWeek] ?? "",
        })),
      }),
    [recurrenceEnd, recurrenceStart, recurringDays, recurringTimes],
  );
  const price = unitPrice * (isRecurring ? recurringOccurrences.length : 1);

  const monthCells = useMemo(() => getMonthCells(calendarMonth), [calendarMonth]);
  const monthLabel = new Intl.DateTimeFormat("es-PE", {
    month: "long",
    year: "numeric",
  }).format(calendarMonth);

  const availableTimes = useMemo(() => {
    const serviceHours = duration ?? 4;
    return Array.from({ length: Math.max(1, 13 - serviceHours) }, (_, index) => 7 + index);
  }, [duration]);
  const availableTimesForDate = useMemo(() => {
    if (!isRecurring || !date) return availableTimes;
    const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay();
    const recurringTime = recurringTimes[dayOfWeek];
    return recurringTime ? [Number(recurringTime.slice(0, 2))] : [];
  }, [availableTimes, date, isRecurring, recurringTimes]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCatalog() {
      try {
        const response = await fetch("/api/v1/catalog", {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          districts?: Array<{ id: number; slug: string; name: string }>;
          agents?: Array<{
            id: number;
            slug: string;
            name: string;
            profession: string;
            rating: string | number | null;
          }>;
        };
        if (Array.isArray(payload.districts) && payload.districts.length > 0) {
          const nextDistricts = payload.districts.map((item) => ({
            id: item.id,
            slug: item.slug,
            name: item.name,
          }));
          setCatalogDistricts(nextDistricts);
          setDistrict((current) => {
            if (!current) return current;
            return (
              nextDistricts.find(
                (item) => item.slug === current.slug || item.name === current.name,
              ) ?? current
            );
          });
        }
        if (Array.isArray(payload.agents) && payload.agents.length > 0) {
          const nextStaff = payload.agents.map((agent) => {
            const fallback =
              staffMembers.find((member) => member.name === agent.name) ??
              staffMembers[0]!;
            return {
              id: agent.id,
              name: agent.name,
              profession: agent.profession || fallback.profession,
              rating:
                agent.rating === null || agent.rating === undefined
                  ? null
                  : Number(agent.rating),
              image: fallback.image,
            };
          });
          setCatalogStaff(nextStaff);
          setStaff((current) => {
            if (!current) return current;
            return nextStaff.find((item) => item.name === current.name) ?? current;
          });
        }
      } catch {
        // Keep the published static catalog if the API is temporarily unavailable.
      }
    }
    void loadCatalog();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!district || !date || !time || !duration) return;
    const districtId = district.id;

    const controller = new AbortController();
    async function loadAvailability() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      setAvailabilityLoading(true);
      setAvailabilityError("");
      setAvailableStaffIds(null);

      try {
        const response = await fetch("/api/v1/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            districtId,
            durationHours: duration,
            date,
            time,
            recurrence: isRecurring
              ? {
                  times: recurringDays.map((dayOfWeek) => ({
                    dayOfWeek,
                    time: recurringTimes[dayOfWeek],
                  })),
                  startsOn: recurrenceStart,
                  endsOn: recurrenceEnd,
                }
              : undefined,
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("availability-unavailable");
        const payload = (await response.json()) as { agentIds?: number[] };
        const ids = Array.isArray(payload.agentIds) ? payload.agentIds : [];
        setAvailableStaffIds(ids);
        setStaff((current) =>
          current && !ids.includes(current.id) ? null : current,
        );
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }
        setAvailableStaffIds([]);
        setStaff(null);
        setAvailabilityError(
          "No pudimos verificar la agenda. Inténtalo nuevamente antes de continuar.",
        );
      } finally {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      }
    }

    void loadAvailability();

    return () => controller.abort();
  }, [
    date,
    district,
    duration,
    isRecurring,
    recurrenceEnd,
    recurrenceStart,
    recurringDays,
    recurringTimes,
    time,
  ]);

  useEffect(() => {
    if (!durationOpen) return;
    const dialog = durationDialogRef.current;
    const focusable = Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? [],
    );
    focusable[0]?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDurationOpen(false);
        durationTriggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [durationOpen]);

  function updateCustomer(key: keyof CustomerForm, value: string) {
    setCustomer((current) => ({ ...current, [key]: value }));
  }

  function validateCurrentStep() {
    if (step === 1 && !district) return "Por favor, selecciona una ubicación.";
    if (step === 2 && !service) return "Por favor, selecciona un servicio.";
    if (isRecurring && step === 3) {
      if (recurringDays.length === 0) return "Selecciona al menos un día de atención.";
      if (recurringDays.some((day) => !recurringTimes[day])) {
        return "Selecciona una hora para cada día recurrente.";
      }
      if (!recurrenceStart || !recurrenceEnd || recurrenceEnd < recurrenceStart) {
        return "Selecciona un rango válido para el servicio recurrente.";
      }
      if (recurringOccurrences.length < 2) {
        return "El periodo recurrente debe incluir al menos dos visitas.";
      }
    }
    if (step === dateStep && (!date || !time)) return "Selecciona la fecha y una hora disponible.";
    if (isRecurring && step === dateStep) {
      const firstOccurrence = recurringOccurrences[0];
      if (!firstOccurrence || date !== firstOccurrence.date || time !== firstOccurrence.time) {
        return "La primera visita debe coincidir con tu calendario recurrente.";
      }
    }
    if (step === staffStep && availabilityLoading) {
      return "Espera mientras verificamos la disponibilidad.";
    }
    if (step === staffStep && availableStaffIds === null) {
      return "Debemos verificar la disponibilidad antes de continuar.";
    }
    if (step === staffStep && (availableStaffIds?.length ?? 0) === 0) {
      return "No hay personal disponible para todo el horario seleccionado.";
    }
    if (step === staffStep && !staff) return "Por favor, selecciona personal.";
    if (
      step === informationStep &&
      (!customer.email ||
        !customer.phone ||
        !customer.firstName ||
        !customer.lastName ||
        !customer.address)
    ) {
      return "Por favor completa los campos requeridos de manera correcta.";
    }
    return "";
  }

  function next() {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    if (step === 2 && !duration) {
      durationTriggerRef.current = document.activeElement as HTMLElement | null;
      setDurationOpen(true);
      return;
    }
    if (isRecurring && step === 3) {
      const firstOccurrence = recurringOccurrences[0];
      if (!firstOccurrence) {
        setError("El periodo debe generar al menos dos visitas.");
        return;
      }
      setDate(firstOccurrence.date);
      setTime(firstOccurrence.time);
      setStaff(null);
      setAvailableStaffIds(null);
      setCalendarMonth(new Date(`${firstOccurrence.date}T12:00:00`));
    }
    setStep((current) => Math.min(reviewStep, current + 1));
  }

  function previous() {
    setError("");
    setStep((current) => Math.max(1, current - 1));
  }

  function chooseDuration(hours: number) {
    setDuration(hours);
    setStaff(null);
    setAvailableStaffIds(null);
    setAvailabilityError("");
    setDurationOpen(false);
    setStep(3);
    setError("");
  }

  function closeDurationDialog() {
    setDurationOpen(false);
    queueMicrotask(() => durationTriggerRef.current?.focus());
  }

  function reset() {
    setStep(1);
    setDistrict(null);
    setService(null);
    setDuration(null);
    setDate("");
    setTime("");
    setStaff(null);
    setCustomer(defaultCustomer);
    setRecurringDays([]);
    setRecurringTimes({});
    setRecurrenceStart(localIsoDate(tomorrow));
    const recurrenceEndDate = new Date(tomorrow);
    recurrenceEndDate.setDate(recurrenceEndDate.getDate() + 30);
    setRecurrenceEnd(localIsoDate(recurrenceEndDate));
    setConfirmationCode("");
    setBookingResult(null);
    setAvailableStaffIds(null);
    setAvailabilityError("");
    idempotencyKey.current = "";
    setError("");
  }

  async function confirmBooking() {
    if (!district || !service || !duration || !date || !time || !staff) return;
    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/v1/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current,
        },
        body: JSON.stringify({
          districtId: district.id,
          serviceId: service.id,
          durationHours: duration,
          date,
          time,
          staffId: staff.id,
          customer,
          paymentMethod,
          timezone: "America/Lima",
          recurrence: isRecurring
            ? {
                weekdays: recurringDays,
                times: recurringDays.map((dayOfWeek) => ({
                  dayOfWeek,
                  time: recurringTimes[dayOfWeek],
                })),
                startsOn: recurrenceStart,
                endsOn: recurrenceEnd,
              }
            : undefined,
        }),
      });
      const payload = (await response.json()) as BookingResponse;
      if (!response.ok) {
        throw new Error(
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message ?? "No pudimos completar la reserva.",
        );
      }
      setConfirmationCode(
        payload.confirmationCode ?? payload.confirmation_code ?? payload.id ?? "",
      );
      setBookingResult(payload);
      if (payload.payment?.checkoutUrl) {
        window.location.assign(payload.payment.checkoutUrl);
        return;
      }
      setStep(confirmationStep);
    } catch (bookingError) {
      setError(
        bookingError instanceof Error
          ? bookingError.message
          : "No pudimos completar la reserva. Inténtalo de nuevo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleInformationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    next();
  }

  const calendarStart = date && time ? new Date(`${date}T${time}:00-05:00`) : null;
  const calendarEnd = calendarStart
    ? new Date(calendarStart.getTime() + (duration ?? 4) * 60 * 60 * 1000)
    : null;
  const calendarFormat = (value: Date) =>
    value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const googleCalendarUrl =
    calendarStart && calendarEnd
      ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Servicio de limpieza Reludcir")}&dates=${calendarFormat(calendarStart)}/${calendarFormat(calendarEnd)}&details=${encodeURIComponent(`Reserva ${confirmationCode}`)}&location=${encodeURIComponent(customer.address)}`
      : "#";
  const ics =
    calendarStart && calendarEnd
      ? [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "BEGIN:VEVENT",
          `UID:${confirmationCode}@reludcir.com`,
          `DTSTART:${calendarFormat(calendarStart)}`,
          `DTEND:${calendarFormat(calendarEnd)}`,
          "SUMMARY:Servicio de limpieza Reludcir",
          `LOCATION:${customer.address.replace(/,/g, "\\,")}`,
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n")
      : "";

  return (
    <div className="bookingShell" id="reservar">
      <div className="bookingSidebar">
        <ol>
          {activeStepLabels.map((label, index) => {
            const number = index + 1;
            const selected = number === step;
            const completed = number < step;
            return (
              <li
                className={selected ? "active" : completed ? "completed" : ""}
                key={label}
              >
                <button
                  type="button"
                  disabled={!completed}
                  onClick={() => completed && setStep(number)}
                  aria-current={selected ? "step" : undefined}
                >
                  <span>{completed ? <Check aria-hidden="true" /> : number}</span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
        <div className="bookingHelp">
          <CircleHelp aria-hidden="true" />
          <div>
            <span>¿Tienes alguna pregunta?</span>
            <a href="tel:+51994358300">+51 994 358 300</a>
          </div>
        </div>
      </div>

      <div className="bookingMain">
        <div className="bookingBody" aria-live="polite">
          {step === 1 && (
            <section className="bookingStep" aria-labelledby="location-title">
              <h2 id="location-title">Selecciona ubicación</h2>
              <div className="locationGrid">
                {catalogDistricts.map((item) => (
                  <button
                    className={district?.id === item.id ? "selectionCard selected" : "selectionCard"}
                    type="button"
                    aria-pressed={district?.id === item.id}
                    key={item.id}
                    onClick={() => {
                      setDistrict(item);
                      setStaff(null);
                      setAvailableStaffIds(null);
                      setAvailabilityError("");
                      setError("");
                    }}
                  >
                    <span className="locationIcon">
                      <MapPin aria-hidden="true" />
                    </span>
                    <span>{item.name}</span>
                    {district?.id === item.id && <Check className="cardCheck" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="bookingStep" aria-labelledby="service-title">
              <h2 id="service-title">Seleccionar servicio</h2>
              <div className="serviceCards">
                {servicePlans.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={service?.id === item.id ? "serviceCard selected" : "serviceCard"}
                    aria-pressed={service?.id === item.id}
                    onClick={() => {
                      setService(item);
                      setDuration(null);
                      setStaff(null);
                      setAvailableStaffIds(null);
                      setAvailabilityError("");
                      setError("");
                    }}
                  >
                    <Image src={item.image} alt="" width={104} height={104} />
                    <span className="serviceCardContent">
                      <small>Lima &gt; hogar &gt; {item.kind === "single" ? "servicio único" : "recurrente"}</small>
                      <strong>
                        {item.name} <span className="rating"><Star aria-hidden="true" /> {item.rating}</span>
                      </strong>
                      <span className="durationHints">4h <b>6h</b> 8h</span>
                      <span>{item.description}</span>
                    </span>
                    <span className="servicePrice">
                      <small>Desde</small>
                      <strong>{formatCurrency(item.startingPrice)}</strong>
                    </span>
                    {service?.id === item.id && <Check className="cardCheck" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </section>
          )}

          {step === 3 && isRecurring && (
            <section className="bookingStep" aria-labelledby="recurring-title">
              <h2 id="recurring-title">Información recurrente</h2>
              <p className="recurringIntro">
                Elige los días y la hora en que necesitas el servicio. Puedes combinar
                varios días dentro del mismo periodo.
              </p>
              <div className="recurringDays">
                {weekDays.map((day) => {
                  const selected = recurringDays.includes(day.id);
                  return (
                    <div className={selected ? "recurringDay selected" : "recurringDay"} key={day.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            setRecurringDays((current) =>
                              event.target.checked
                                ? [...current, day.id]
                                : current.filter((value) => value !== day.id),
                            );
                            setRecurringTimes((current) => ({
                              ...current,
                              [day.id]: current[day.id] ?? "07:00",
                            }));
                            setStaff(null);
                            setAvailableStaffIds(null);
                            setAvailabilityError("");
                            setError("");
                          }}
                        />
                        <span>{day.label}</span>
                      </label>
                      <select
                        aria-label={`Hora para ${day.label}`}
                        value={recurringTimes[day.id] ?? "07:00"}
                        onChange={(event) => {
                          setRecurringTimes((current) => ({
                            ...current,
                            [day.id]: event.target.value,
                          }));
                          setStaff(null);
                          setAvailableStaffIds(null);
                          setAvailabilityError("");
                        }}
                        disabled={!selected}
                      >
                        {availableTimes.map((hour) => {
                          const value = `${String(hour).padStart(2, "0")}:00`;
                          return <option value={value} key={value}>{formatHour(hour)}</option>;
                        })}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="recurringRange">
                <label>
                  Fecha de inicio
                  <input
                    type="date"
                    min={localIsoDate(tomorrow)}
                    value={recurrenceStart}
                    onChange={(event) => {
                      setRecurrenceStart(event.target.value);
                      setStaff(null);
                      setAvailableStaffIds(null);
                      setAvailabilityError("");
                    }}
                  />
                </label>
                <label>
                  Fecha de fin
                  <input
                    type="date"
                    min={recurrenceStart || localIsoDate(tomorrow)}
                    value={recurrenceEnd}
                    onChange={(event) => {
                      setRecurrenceEnd(event.target.value);
                      setStaff(null);
                      setAvailableStaffIds(null);
                      setAvailabilityError("");
                    }}
                  />
                </label>
                <div>
                  <span>Horas por visita</span>
                  <strong>{duration} horas</strong>
                </div>
              </div>
            </section>
          )}

          {step === dateStep && (
            <section className="bookingStep" aria-labelledby="date-title">
              <h2 id="date-title">Selecciona la fecha y hora</h2>
              <div className="dateTimeGrid">
                <div className="calendarPanel">
                  <div className="calendarHeading">
                    <button
                      type="button"
                      aria-label="Mes anterior"
                      onClick={() =>
                        setCalendarMonth(
                          (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                        )
                      }
                    >
                      <ChevronLeft aria-hidden="true" />
                    </button>
                    <strong>{monthLabel}</strong>
                    <button
                      type="button"
                      aria-label="Mes siguiente"
                      onClick={() =>
                        setCalendarMonth(
                          (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                        )
                      }
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </div>
                  <div className="calendarWeekdays" aria-hidden="true">
                    {['Lun', 'Mar', 'Mier', 'Jue', 'Vie', 'Sab', 'Dom'].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="calendarDays">
                    {monthCells.map((day, index) => {
                      if (!day) return <span key={`empty-${index}`} />;
                      const iso = localIsoDate(day);
                      const dayOfWeek = new Date(`${iso}T12:00:00Z`).getUTCDay();
                      const disabled =
                        day < tomorrow ||
                        (isRecurring &&
                          (iso < recurrenceStart ||
                            iso > recurrenceEnd ||
                            !recurringDays.includes(dayOfWeek)));
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={disabled}
                          className={date === iso ? "selected" : ""}
                          onClick={() => {
                            setDate(iso);
                            setTime(isRecurring ? (recurringTimes[dayOfWeek] ?? "") : "");
                            setStaff(null);
                            setAvailableStaffIds(null);
                            setAvailabilityError("");
                            setError("");
                          }}
                          aria-label={formatDate(iso)}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="timePanel">
                  <h3>Hora</h3>
                  {!date ? (
                    <div className="emptyTime">
                      <CalendarDays aria-hidden="true" />
                      <span>Seleccionar fecha</span>
                    </div>
                  ) : (
                    <>
                      <strong className="selectedDate">{formatDate(date)}</strong>
                      <div className="timeGrid">
                        {availableTimesForDate.map((hour) => {
                          const value = `${String(hour).padStart(2, "0")}:00`;
                          return (
                            <button
                              type="button"
                              className={time === value ? "selected" : ""}
                              aria-pressed={time === value}
                              key={value}
                              onClick={() => {
                                setTime(value);
                                setStaff(null);
                                setAvailableStaffIds(null);
                                setAvailabilityError("");
                                setError("");
                              }}
                            >
                              <span>{formatHour(hour)}</span>
                              <ArrowRight aria-hidden="true" />
                              <span>{addHoursToTime(value, duration ?? 4)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {step === staffStep && (
            <section className="bookingStep" aria-labelledby="staff-title">
              <h2 id="staff-title">Seleccionar personal</h2>
              {availabilityLoading ? (
                <p className="availabilityMessage" role="status">Consultando disponibilidad…</p>
              ) : null}
              {availableStaffIds?.length === 0 ? (
                <p className="availabilityMessage error" role="alert">
                  {availabilityError ||
                    "No hay agentes libres para todo el horario. Regresa y elige otra fecha."}
                </p>
              ) : null}
              <div className="staffGrid">
                {catalogStaff
                  .filter(
                    (member) =>
                      availableStaffIds?.includes(member.id) ?? false,
                  )
                  .map((member) => (
                  <button
                    type="button"
                    className={staff?.id === member.id ? "staffCard selected" : "staffCard"}
                    aria-pressed={staff?.id === member.id}
                    key={member.id}
                    onClick={() => {
                      setStaff(member);
                      setError("");
                    }}
                  >
                    <Image src={member.image} alt="" width={86} height={86} />
                    <span>
                      <strong>{member.name}</strong>
                      {member.rating && (
                        <small><Star aria-hidden="true" /> {member.rating.toFixed(1)}</small>
                      )}
                      <span>{member.profession}</span>
                    </span>
                    {staff?.id === member.id && <Check className="cardCheck" aria-hidden="true" />}
                  </button>
                  ))}
              </div>
            </section>
          )}

          {step === informationStep && (
            <form className="bookingStep" id="customer-form" onSubmit={handleInformationSubmit}>
              <h2>Completa tu información</h2>
              <div className="customerGrid">
                <label>
                  Correo electrónico
                  <input
                    type="email"
                    autoComplete="email"
                    value={customer.email}
                    onChange={(event) => updateCustomer("email", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Teléfono [con WhatsApp]
                  <span className="phoneField"><b>+51</b><input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="912 345 678"
                    value={customer.phone}
                    onChange={(event) => updateCustomer("phone", event.target.value)}
                    required
                  /></span>
                </label>
                <label>
                  Nombre
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={customer.firstName}
                    onChange={(event) => updateCustomer("firstName", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Apellido
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={customer.lastName}
                    onChange={(event) => updateCustomer("lastName", event.target.value)}
                    required
                  />
                </label>
                <label className="fullField">
                  Dirección del servicio, ubicar en mapa [obligatorio]
                  <input
                    type="text"
                    autoComplete="street-address"
                    placeholder="Dirección donde se realizará la limpieza"
                    value={customer.address}
                    onChange={(event) => updateCustomer("address", event.target.value)}
                    required
                  />
                </label>
                <label className="fullField">
                  Depart./interior [opcional]
                  <input
                    type="text"
                    placeholder="Número de tu depa o interior"
                    value={customer.interior}
                    onChange={(event) => updateCustomer("interior", event.target.value)}
                  />
                </label>
              </div>
              <div className="mapPreview" aria-label="Validación de dirección">
                <div className="mapRoad roadOne" />
                <div className="mapRoad roadTwo" />
                <MapPin aria-hidden="true" />
                <span className={customer.address.length > 7 ? "addressStatus valid" : "addressStatus"}>
                  {customer.address.length > 7 ? (
                    <><Check aria-hidden="true" /> Dirección validada</>
                  ) : (
                    <>Escribe una dirección para ubicarla</>
                  )}
                </span>
              </div>
              <button type="submit" hidden aria-hidden="true">Continuar</button>
            </form>
          )}

          {step === reviewStep && district && service && duration && staff && (
            <section className="bookingStep" aria-labelledby="review-title">
              <h2 id="review-title">Revisa el pedido</h2>
              <div className="reviewLayout">
                <div className="reviewCard">
                  <dl>
                    <div><dt>Servicio</dt><dd>{service.name}</dd></div>
                    <div><dt>Ubicación</dt><dd>{district.name}</dd></div>
                    <div><dt>Fecha</dt><dd>{formatDate(date)}</dd></div>
                    <div><dt>Horario</dt><dd>{formatHour(Number(time.slice(0, 2)))} – {addHoursToTime(time, duration)}</dd></div>
                    <div><dt>Personal</dt><dd>{staff.name}</dd></div>
                    {isRecurring && (
                      <>
                        <div>
                          <dt>Recurrencia</dt>
                          <dd>
                            {recurringDays
                              .map((day) => weekDays.find((item) => item.id === day)?.label)
                              .filter(Boolean)
                              .join(", ")} · {recurrenceStart} al {recurrenceEnd}
                          </dd>
                        </div>
                        <div>
                          <dt>Visitas</dt>
                          <dd>{recurringOccurrences.length} × {formatCurrency(unitPrice)}</dd>
                        </div>
                      </>
                    )}
                    <div><dt>Dirección</dt><dd>{customer.address}{customer.interior ? `, ${customer.interior}` : ""}</dd></div>
                    <div className="reviewTotal"><dt>Total</dt><dd>{formatCurrency(price)}</dd></div>
                  </dl>
                </div>
                <div className="paymentCard">
                  <h3>Método de pago</h3>
                  <button type="button" aria-pressed={paymentMethod === "card"} className={paymentMethod === "card" ? "selected" : ""} onClick={() => setPaymentMethod("card")}>
                    <CreditCard aria-hidden="true" /><span><strong>Tarjeta</strong><small>Crédito o débito</small></span><Check aria-hidden="true" />
                  </button>
                  <button type="button" aria-pressed={paymentMethod === "yape"} className={paymentMethod === "yape" ? "selected" : ""} onClick={() => setPaymentMethod("yape")}>
                    <WalletCards aria-hidden="true" /><span><strong>Yape</strong><small>Pago móvil</small></span><Check aria-hidden="true" />
                  </button>
                  <button type="button" aria-pressed={paymentMethod === "transfer"} className={paymentMethod === "transfer" ? "selected" : ""} onClick={() => setPaymentMethod("transfer")}>
                    <ShieldCheck aria-hidden="true" /><span><strong>Transferencia bancaria</strong><small>Confirmación manual</small></span><Check aria-hidden="true" />
                  </button>
                  <p><ShieldCheck aria-hidden="true" /> Tu cupo se vuelve a validar al confirmar para evitar reservas duplicadas.</p>
                </div>
              </div>
            </section>
          )}

          {step === confirmationStep && (
            <section className="bookingStep confirmationStep" aria-labelledby="confirmed-title">
              <div className="successIcon"><Check aria-hidden="true" /></div>
              <h2 id="confirmed-title">¡Pedido registrado! 🎉</h2>
              <p>
                {bookingResult?.payment?.status === "paid"
                  ? "Tu reserva está confirmada. Número de confirmación:"
                  : "La reserva quedó separada y pendiente de pago. Número de pedido:"}
              </p>
              <strong className="confirmationCode">{confirmationCode}</strong>
              {bookingResult?.visits && bookingResult.visits > 1 ? (
                <p>
                  {bookingResult.visits} visitas · total de la serie {formatCurrency(Number(bookingResult.total ?? 0))}
                </p>
              ) : null}
              {bookingResult?.payment?.instructions ? (
                <p className="paymentInstructions">{bookingResult.payment.instructions}</p>
              ) : null}
              <div className="confirmationActions">
                <a href={googleCalendarUrl} target="_blank" rel="noreferrer">
                  <CalendarDays aria-hidden="true" /> Agregar a Google Calendar
                </a>
                <a href={`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`} download={`reludcir-${confirmationCode}.ics`}>
                  <Download aria-hidden="true" /> Agregar a iCal Calendar
                </a>
                <button type="button" onClick={reset}><Plus aria-hidden="true" /> Hacer otra reserva</button>
                <Link href="/mis-reservas"><ExternalLink aria-hidden="true" /> Finalizar</Link>
              </div>
            </section>
          )}
        </div>

        {step < confirmationStep && (
          <div className="bookingFooter">
            <button className="backButton" type="button" onClick={previous} disabled={step === 1}>
              <ArrowLeft aria-hidden="true" /> ATRÁS
            </button>
            {error && <p className="bookingError" role="alert">{error}</p>}
            {step === reviewStep ? (
              <button className="nextButton" type="button" onClick={confirmBooking} disabled={submitting}>
                {submitting ? <RefreshCw className="spinning" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
                {submitting ? "PROCESANDO" : "CONFIRMAR TURNO"}
              </button>
            ) : (
              <button className="nextButton" type={step === informationStep ? "submit" : "button"} form={step === informationStep ? "customer-form" : undefined} onClick={step === informationStep ? undefined : next} disabled={step === staffStep && (availabilityLoading || availableStaffIds === null)}>
                SIGUIENTE <ArrowRight aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {durationOpen && service && (
        <div className="durationOverlay" role="dialog" aria-modal="true" aria-labelledby="duration-title">
          <div className="durationDialog" ref={durationDialogRef}>
            <button className="dialogClose" type="button" onClick={closeDurationDialog} aria-label="Cerrar">
              <X aria-hidden="true" />
            </button>
            <Clock3 aria-hidden="true" className="durationIcon" />
            <h2 id="duration-title">
              Selecciona la duración del servicio {service.kind === "single" ? "único" : "recurrente"}.
            </h2>
            <div className="durationOptions">
              {packages.map((item) => (
                <button type="button" key={item.id} onClick={() => chooseDuration(item.hours)}>
                  <span><strong>{item.hours} horas</strong><small>[{service.kind === "single" ? "un solo servicio" : "servicio recurrente"}]</small></span>
                  <b>{formatCurrency(service.kind === "single" ? item.singlePrice : item.recurringPrice)}</b>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
            <span className="durationOr">O</span>
            <button className="defaultDuration" type="button" onClick={() => chooseDuration(4)}>
              Continuar con la duración predeterminada <strong>{formatCurrency(service.startingPrice)}</strong>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
