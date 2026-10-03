import { beforeEach, describe, expect, it } from "vitest";
import { feeRates } from "@/config/rental";
import type { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { adminRefund } from "@/server/admin/payments";
import type { PolicyContext } from "@/server/auth/policies";
import { db } from "@/server/db";
import { addDamage, pickUp, receiveReturn } from "@/server/inspections/service";
import { recordManualDeposit, startDeposit } from "@/server/payments/deposits";
import { settleBooking, settlementContext } from "@/server/payments/settlement";
import { fakeProvider } from "@/server/payments/providers/fake";
import { handlePaymentWebhook } from "@/server/payments/service";
import { simulateDeposit } from "@/server/payments/simulate";
import { bookingData, createFleet, resetDb, signedContract } from "./helpers";

type Fleet = Awaited<ReturnType<typeof createFleet>>;
let fleet: Fleet;
let staff: PolicyContext;
let manager: PolicyContext;

const HOUR = 3_600_000;
const DEPOSIT = 300_000;
const pickupAt = new Date(Date.now() - 80 * HOUR);

async function actor(role: Role): Promise<PolicyContext> {
  const user = await db.user.create({
    data: { email: `${role.toLowerCase()}@example.com`, name: role, role, emailVerified: true },
  });
  return { actor: { userId: user.id, role, twoFactorEnabled: true } };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return { code: error.code, details: error.details };
    throw error;
  }
  throw new Error("forventede en fejl");
}

/** Bekræftet og betalt booking med depositum, der venter. `days` er lejens længde. */
async function bookingWithDeposit(days = 3) {
  const returnAt = new Date(pickupAt.getTime() + days * 24 * HOUR);
  const booking = await db.booking.create({
    data: {
      ...bookingData(fleet, fleet.carA.id, pickupAt.toISOString(), returnAt.toISOString()),
      paymentStatus: "PAID",
      depositStatus: "PENDING",
      depositMinor: DEPOSIT,
    },
  });
  await db.payment.create({
    data: {
      bookingId: booking.id,
      kind: "MANUAL",
      status: "SUCCEEDED",
      method: "CASH",
      amountMinor: booking.totalMinor,
      currency: "DKK",
      provider: "manual",
    },
  });
  await signedContract(booking.id);
  return booking;
}

const out = { odometerKm: "1000", fuelLevel: "8", notes: "" };

/** Udlevering og aflevering 3 timer for sent med 800 km kørt og 2/8 mindre brændstof. */
async function rentAndReturn(bookingId: string, returnAt: Date, km = "1800") {
  await pickUp(staff, bookingId, out, pickupAt);
  return receiveReturn(
    staff,
    bookingId,
    { odometerKm: km, fuelLevel: "6", notes: "", carStatus: "ACTIVE" },
    new Date(returnAt.getTime() + 3 * HOUR),
  );
}

const suggested = { extraKm: "500", fuel: "200", late: "450" };
const FEES = 50_000 + 2 * feeRates.fuelPerEighthMinor + 3 * feeRates.latePerHourMinor;

beforeEach(async () => {
  await resetDb();
  fleet = await createFleet();
  staff = await actor("STAFF");
  manager = await actor("MANAGER");
});

describe("depositum ved udlevering", () => {
  it("udlevering kræver depositum; kontant depositum registreres", async () => {
    const booking = await bookingWithDeposit();
    expect(await failure(pickUp(staff, booking.id, out, pickupAt))).toMatchObject({
      code: "CONFLICT",
      details: { reason: "DEPOSIT_MISSING" },
    });

    await recordManualDeposit(staff, booking.id, { method: "CASH" });
    const held = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(held.depositStatus).toBe("HELD");
    const hold = await db.payment.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "DEPOSIT_HOLD" },
    });
    expect(hold).toMatchObject({ status: "SUCCEEDED", amountMinor: DEPOSIT, provider: "manual" });

    // Et dobbeltklik giver ikke to depositummer.
    expect(await failure(recordManualDeposit(staff, booking.id, { method: "CASH" }))).toMatchObject(
      { code: "CONFLICT" },
    );
    await expect(pickUp(staff, booking.id, out, pickupAt)).resolves.toBeTruthy();
  });

  it("kort: reservation ved korte lejer, træk ved lange (K6); lejens betaling røres ikke", async () => {
    const short = await bookingWithDeposit(3);
    expect((await startDeposit(staff, short.id)).isAuthorization).toBe(true);
    await simulateDeposit(staff, short.id);
    const shortHold = await db.payment.findFirstOrThrow({
      where: { bookingId: short.id, kind: "DEPOSIT_HOLD" },
    });
    expect(shortHold).toMatchObject({
      status: "SUCCEEDED",
      isAuthorization: true,
      cardLast4: "4242",
    });
    expect(await db.booking.findUniqueOrThrow({ where: { id: short.id } })).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      depositStatus: "HELD",
    });

    await db.booking.update({ where: { id: short.id }, data: { status: "CANCELLED" } });
    const long = await bookingWithDeposit(10);
    expect((await startDeposit(staff, long.id)).isAuthorization).toBe(false);
    await simulateDeposit(staff, long.id);
    expect(await db.booking.findUniqueOrThrow({ where: { id: long.id } })).toMatchObject({
      status: "CONFIRMED",
      depositStatus: "HELD",
    });
  });

  it("et afvist kort ændrer ikke lejens betaling; depositum venter stadig", async () => {
    const booking = await bookingWithDeposit();
    await startDeposit(staff, booking.id);
    const hold = await db.payment.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "DEPOSIT_HOLD" },
    });
    const { body, signature } = fakeProvider.signedEvent(
      hold.providerRef!,
      "failed",
      DEPOSIT,
      "DKK",
    );
    await handlePaymentWebhook(body, signature);
    expect(await db.payment.findUniqueOrThrow({ where: { id: hold.id } })).toMatchObject({
      status: "FAILED",
    });
    expect(await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({
      paymentStatus: "PAID",
      depositStatus: "PENDING",
    });
    // Et nyt forsøg giver en ny betaling hos udbyderen.
    await simulateDeposit(staff, booking.id);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe(
      "HELD",
    );
  });

  it("en kunde kan ikke registrere depositum", async () => {
    const booking = await bookingWithDeposit();
    const customer: PolicyContext = {
      actor: { userId: fleet.customer.id, role: "CUSTOMER", twoFactorEnabled: false },
    };
    expect(
      await failure(recordManualDeposit(customer, booking.id, { method: "CASH" })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("afregning efter aflevering", () => {
  it("foreslår tillæg og trækker dem fra kort-reservationen; resten frigives", async () => {
    const booking = await bookingWithDeposit();
    await simulateDeposit(staff, booking.id);
    await rentAndReturn(booking.id, booking.returnAt);

    const context = await settlementContext(staff, booking.id);
    expect(context.canSettle).toBe(true);
    expect(context.needsManager).toBe(false);
    expect(context.fees).toMatchObject({
      drivenKm: 800,
      includedKm: 600,
      extraKm: { quantity: 200, totalMinor: 50_000 },
      fuel: { quantity: 2 },
      late: { quantity: 3 },
    });

    const result = await settleBooking(staff, booking.id, suggested);
    expect(result).toMatchObject({
      feesMinor: FEES,
      capturedMinor: FEES,
      returnedMinor: DEPOSIT - FEES,
      cashBackMinor: 0,
      balanceMinor: 0,
    });

    const settled = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { items: true, payments: true },
    });
    expect(settled.settledAt).not.toBeNull();
    expect(settled.depositStatus).toBe("CAPTURED");
    expect(settled.paymentStatus).toBe("PAID");
    expect(settled.totalMinor).toBe(99_900 + FEES);
    expect(settled.items.map((item) => [item.type, item.quantity, item.totalMinor])).toEqual(
      expect.arrayContaining([
        ["EXTRA_KM", 200, 50_000],
        ["FUEL", 2, 2 * feeRates.fuelPerEighthMinor],
        ["LATE_FEE", 3, 3 * feeRates.latePerHourMinor],
      ]),
    );
    const kinds = settled.payments.map((payment) => [payment.kind, payment.amountMinor]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ["DEPOSIT_CAPTURE", FEES],
        ["DEPOSIT_RETURN", DEPOSIT - FEES],
      ]),
    );

    // Kun én afregning.
    expect(await failure(settleBooking(staff, booking.id, suggested))).toMatchObject({
      code: "CONFLICT",
    });

    // Et trukket depositum kan refunderes via kortet (MANAGER).
    await adminRefund(manager, booking.id, { amount: "200", reason: "Brændstof var fyldt op" });
    const refund = await db.payment.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "REFUND" },
      include: { parent: true },
    });
    expect(refund).toMatchObject({ status: "SUCCEEDED", provider: "fake", amountMinor: 20_000 });
    expect(refund.parent?.kind).toBe("DEPOSIT_CAPTURE");
  });

  it("personalet kan rette forslaget; uden tillæg frigives et kontant depositum", async () => {
    const booking = await bookingWithDeposit();
    await recordManualDeposit(staff, booking.id, { method: "CASH" });
    await rentAndReturn(booking.id, booking.returnAt);

    const result = await settleBooking(staff, booking.id, { extraKm: "0", fuel: "0", late: "0" });
    expect(result).toMatchObject({ feesMinor: 0, capturedMinor: 0, cashBackMinor: DEPOSIT });
    const settled = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { items: true, payments: { where: { kind: "DEPOSIT_RETURN" } } },
    });
    expect(settled.depositStatus).toBe("RELEASED");
    expect(settled.items.some((item) => item.type === "EXTRA_KM")).toBe(false);
    expect(settled.payments[0]).toMatchObject({ amountMinor: DEPOSIT, provider: "manual" });
  });

  it("tillæg større end depositum: resten skal betales", async () => {
    const booking = await bookingWithDeposit();
    await recordManualDeposit(staff, booking.id, { method: "CARD" });
    await rentAndReturn(booking.id, booking.returnAt);

    const result = await settleBooking(staff, booking.id, {
      extraKm: "4.000",
      fuel: "0",
      late: "0",
    });
    expect(result).toMatchObject({
      feesMinor: 400_000,
      capturedMinor: DEPOSIT,
      returnedMinor: 0,
      balanceMinor: 100_000,
    });
    // Et rettet beløb gemmes som én linje.
    const item = await db.bookingItem.findFirstOrThrow({
      where: { bookingId: booking.id, type: "EXTRA_KM" },
    });
    expect(item).toMatchObject({ quantity: 1, totalMinor: 400_000 });
  });

  it("langt lejemål: trukket depositum betales tilbage via kortet", async () => {
    const booking = await bookingWithDeposit(10);
    await simulateDeposit(staff, booking.id);
    await rentAndReturn(booking.id, booking.returnAt, "1000");

    const result = await settleBooking(staff, booking.id, {
      extraKm: "0",
      fuel: "200",
      late: "450",
    });
    const fees = 2 * feeRates.fuelPerEighthMinor + 3 * feeRates.latePerHourMinor;
    expect(result).toMatchObject({ capturedMinor: fees, returnedMinor: DEPOSIT - fees });
    const back = await db.payment.findFirstOrThrow({
      where: { bookingId: booking.id, kind: "DEPOSIT_RETURN" },
    });
    expect(back.providerRef).toMatch(/^fake_re_/);
  });

  it("nye skader kræver en leder, der vælger ansvar og beløb", async () => {
    const booking = await bookingWithDeposit();
    await recordManualDeposit(staff, booking.id, { method: "CASH" });
    const returned = await rentAndReturn(booking.id, booking.returnAt, "1600");
    const damage = await addDamage(staff, returned.id, {
      area: "rear",
      severity: "MINOR",
      description: "Bule i bagklappen",
      liability: "",
      estimatedCost: "1.500",
    });

    expect((await settlementContext(staff, booking.id)).needsManager).toBe(true);
    const noFees = { extraKm: "0", fuel: "200", late: "450" };
    expect(await failure(settleBooking(staff, booking.id, noFees))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await failure(settleBooking(manager, booking.id, noFees))).toMatchObject({
      code: "VALIDATION_FAILED",
    });
    expect(
      await failure(
        settleBooking(manager, booking.id, {
          ...noFees,
          damages: [{ id: damage.id, liability: "UNDECIDED", amount: "1500" }],
        }),
      ),
    ).toMatchObject({ code: "VALIDATION_FAILED" });

    const result = await settleBooking(manager, booking.id, {
      ...noFees,
      damages: [{ id: damage.id, liability: "CUSTOMER", amount: "1.200" }],
    });
    const fees = 2 * feeRates.fuelPerEighthMinor + 3 * feeRates.latePerHourMinor + 120_000;
    expect(result).toMatchObject({ feesMinor: fees, capturedMinor: fees });
    expect(await db.damage.findUniqueOrThrow({ where: { id: damage.id } })).toMatchObject({
      liability: "CUSTOMER",
      estimatedCostMinor: 120_000,
    });
    const item = await db.bookingItem.findFirstOrThrow({
      where: { bookingId: booking.id, type: "DAMAGE" },
    });
    expect(item.totalMinor).toBe(120_000);
  });

  it("en skade med andet ansvar opkræves ikke", async () => {
    const booking = await bookingWithDeposit();
    await recordManualDeposit(staff, booking.id, { method: "CASH" });
    const returned = await rentAndReturn(booking.id, booking.returnAt, "1000");
    const damage = await addDamage(staff, returned.id, {
      area: "front",
      severity: "MINOR",
      description: "Stenslag i ruden",
      liability: "",
      estimatedCost: "",
    });
    const result = await settleBooking(manager, booking.id, {
      extraKm: "0",
      fuel: "0",
      late: "0",
      damages: [{ id: damage.id, liability: "THIRD_PARTY", amount: "900" }],
    });
    expect(result).toMatchObject({ feesMinor: 0, capturedMinor: 0, returnedMinor: DEPOSIT });
    expect(await db.damage.findUniqueOrThrow({ where: { id: damage.id } })).toMatchObject({
      liability: "THIRD_PARTY",
      estimatedCostMinor: null,
    });
  });

  it("kan ikke afregnes før aflevering", async () => {
    const booking = await bookingWithDeposit();
    await recordManualDeposit(staff, booking.id, { method: "CASH" });
    await pickUp(staff, booking.id, out, pickupAt);
    expect((await settlementContext(staff, booking.id)).canSettle).toBe(false);
    expect(await failure(settleBooking(staff, booking.id, suggested))).toMatchObject({
      code: "CONFLICT",
    });
  });
});
