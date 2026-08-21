export const CURRENCY = "PEN" as const;
export const EXTRA_HOUR_PRICE_MINOR = 1_500;

export const PACKAGE_PRICES = {
  4: {
    durationMinutes: 240,
    maxAreaSqm: 50,
    oneTimeAmountMinor: 6_700,
    recurringAmountMinor: 6_100,
  },
  6: {
    durationMinutes: 360,
    maxAreaSqm: 90,
    oneTimeAmountMinor: 9_900,
    recurringAmountMinor: 9_100,
  },
  8: {
    durationMinutes: 480,
    maxAreaSqm: 120,
    oneTimeAmountMinor: 12_700,
    recurringAmountMinor: 11_600,
  },
} as const;

export type PackageHours = keyof typeof PACKAGE_PRICES;
export type BookingMode = "one_time" | "recurring";

export interface CalculatePriceInput {
  hours: PackageHours;
  mode: BookingMode;
  visits?: number;
  extraHoursPerVisit?: number;
}

export interface PriceQuote {
  currency: typeof CURRENCY;
  durationMinutes: number;
  visits: number;
  baseAmountMinor: number;
  extrasAmountMinor: number;
  unitAmountMinor: number;
  totalAmountMinor: number;
  unitAmount: string;
  totalAmount: string;
}

export function minorUnitsToDecimal(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("amountMinor must be a non-negative safe integer.");
  }

  const whole = Math.floor(amountMinor / 100);
  const fraction = String(amountMinor % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function decimalToMinorUnits(amount: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw new RangeError("amount must be a non-negative decimal with at most two places.");
  }
  const [whole, fraction = ""] = amount.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("amount exceeds the safe integer range.");
  }
  return result;
}

export function isPackageHours(value: number): value is PackageHours {
  return value === 4 || value === 6 || value === 8;
}

export function getPackageAmountMinor(
  hours: PackageHours,
  mode: BookingMode,
): number {
  const selectedPackage = PACKAGE_PRICES[hours];
  return mode === "recurring"
    ? selectedPackage.recurringAmountMinor
    : selectedPackage.oneTimeAmountMinor;
}

export function calculateBookingPrice({
  hours,
  mode,
  visits = mode === "recurring" ? 2 : 1,
  extraHoursPerVisit = 0,
}: CalculatePriceInput): PriceQuote {
  if (!isPackageHours(hours)) {
    throw new RangeError("hours must be one of 4, 6, or 8.");
  }

  if (!Number.isSafeInteger(visits) || visits < 1) {
    throw new RangeError("visits must be a positive integer.");
  }

  if (mode === "one_time" && visits !== 1) {
    throw new RangeError("A one-time booking must contain exactly one visit.");
  }

  if (mode === "recurring" && visits < 2) {
    throw new RangeError("A recurring booking must contain at least two visits.");
  }

  if (!Number.isSafeInteger(extraHoursPerVisit) || extraHoursPerVisit < 0) {
    throw new RangeError("extraHoursPerVisit must be a non-negative integer.");
  }

  const selectedPackage = PACKAGE_PRICES[hours];
  const baseAmountMinor = getPackageAmountMinor(hours, mode);
  const extrasAmountMinor = extraHoursPerVisit * EXTRA_HOUR_PRICE_MINOR;
  const unitAmountMinor = baseAmountMinor + extrasAmountMinor;
  const totalAmountMinor = unitAmountMinor * visits;

  if (!Number.isSafeInteger(totalAmountMinor)) {
    throw new RangeError("The calculated total exceeds the safe integer range.");
  }

  return {
    currency: CURRENCY,
    durationMinutes:
      selectedPackage.durationMinutes + extraHoursPerVisit * 60,
    visits,
    baseAmountMinor,
    extrasAmountMinor,
    unitAmountMinor,
    totalAmountMinor,
    unitAmount: minorUnitsToDecimal(unitAmountMinor),
    totalAmount: minorUnitsToDecimal(totalAmountMinor),
  };
}
