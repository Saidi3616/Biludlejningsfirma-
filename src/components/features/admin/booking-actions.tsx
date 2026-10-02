import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Checkbox, Radio, RadioGroup } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Price } from "@/components/ui/price";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { manualMethods } from "@/lib/validation/admin";

type Action = (formData: FormData) => Promise<void>;

/** Øre som kroner til et inputfelt, fx 45000 → "450,00". */
function kroner(minor: number) {
  return (minor / 100).toFixed(2).replace(".", ",");
}

export type ReschedulePreview =
  | { status: "none" }
  | { status: "error"; notice: string }
  | {
      status: "ok";
      pickupAt: Date;
      returnAt: Date;
      sameCar: boolean;
      registration: string;
      currentTotalMinor: number;
      newTotalMinor: number;
      paidMinor: number;
      currency: string;
    };

type Props = {
  reference: string;
  currency: string;
  timeZone: string;
  balanceMinor: number;
  paidMinor: number;
  /** Ændringsformularens værdier (nuværende periode eller det, der blev prøvet). */
  period: {
    pickupDate: string;
    pickupTime: string;
    returnDate: string;
    returnTime: string;
    price: "keep" | "new";
  };
  canPay: boolean;
  canChange: boolean;
  canRefund: boolean;
  cancel:
    { allowed: false } | { allowed: true; suggestedRefundMinor: number; free: boolean | null };
  carOptions: { id: string; registrationNumber: string; color: string | null }[];
  preview: ReschedulePreview;
  actions: {
    pay: Action;
    reschedule: Action;
    reassign: Action;
    refund: Action;
    cancel: Action;
  };
};

/** Personalets handlinger på en booking (06-admin-flows.md, F3–F6). Vises efter rettigheder. */
export async function BookingActions(props: Props) {
  const t = await getTranslations("admin.booking.actions");
  const { reference, currency, period } = props;
  const hidden = <input type="hidden" name="reference" value={reference} />;
  const money = (amount: number) => <Price amountMinor={amount} currency={currency} />;
  const preview = props.preview;

  return (
    <section aria-labelledby="actions" className="flex flex-col gap-3">
      <h2 id="actions" className="text-lg font-semibold text-ink-900">
        {t("title")}
      </h2>

      {props.canPay ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("pay.title")}</h3>
            <p className="text-sm text-muted">
              {t("pay.status")} {money(props.paidMinor)} · {t("pay.balance")}{" "}
              {money(Math.max(0, props.balanceMinor))}
            </p>
            <form action={props.actions.pay} className="flex flex-col gap-4">
              {hidden}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("pay.amount")} hint={t("amountHint")} required>
                  {(field) => (
                    <Input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={props.balanceMinor > 0 ? kroner(props.balanceMinor) : ""}
                      {...field}
                    />
                  )}
                </Field>
                <Field label={t("pay.method")} required>
                  {(field) => (
                    <Select name="method" defaultValue="CASH" {...field}>
                      {manualMethods.map((method) => (
                        <option key={method} value={method}>
                          {t(`pay.methods.${method}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <Button type="submit" variant="secondary" className="self-start">
                {t("pay.submit")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {props.canChange ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("reschedule.title")}</h3>
            <p className="text-sm text-muted">{t("reschedule.intro")}</p>
            <form
              method="get"
              action={`/admin/bookings/${reference}`}
              className="flex flex-col gap-4"
            >
              <input type="hidden" name="change" value="1" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("reschedule.pickupDate")} required>
                  {(field) => (
                    <Input
                      type="date"
                      name="pickupDate"
                      defaultValue={period.pickupDate}
                      {...field}
                    />
                  )}
                </Field>
                <Field label={t("reschedule.pickupTime")} required>
                  {(field) => (
                    <Input
                      type="time"
                      step={900}
                      name="pickupTime"
                      defaultValue={period.pickupTime}
                      {...field}
                    />
                  )}
                </Field>
                <Field label={t("reschedule.returnDate")} required>
                  {(field) => (
                    <Input
                      type="date"
                      name="returnDate"
                      defaultValue={period.returnDate}
                      {...field}
                    />
                  )}
                </Field>
                <Field label={t("reschedule.returnTime")} required>
                  {(field) => (
                    <Input
                      type="time"
                      step={900}
                      name="returnTime"
                      defaultValue={period.returnTime}
                      {...field}
                    />
                  )}
                </Field>
              </div>
              <RadioGroup legend={t("reschedule.price")}>
                <Radio
                  name="price"
                  value="keep"
                  defaultChecked={period.price === "keep"}
                  label={t("reschedule.keep")}
                />
                <Radio
                  name="price"
                  value="new"
                  defaultChecked={period.price === "new"}
                  label={t("reschedule.new")}
                />
              </RadioGroup>
              <Button type="submit" variant="secondary" className="self-start">
                {t("reschedule.preview")}
              </Button>
            </form>

            {preview.status === "error" ? (
              <p role="alert" className="text-sm font-medium text-danger-700">
                {t(`notices.${preview.notice as "invalid"}`)}
              </p>
            ) : null}
            {preview.status === "ok" ? (
              <div
                role="status"
                className="flex flex-col gap-3 rounded-md border border-border bg-ink-50 p-4"
              >
                <h4 className="font-semibold text-ink-900">{t("reschedule.summary")}</h4>
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted">{t("reschedule.newPeriod")}</dt>
                    <dd className="text-ink-900">
                      {formatDateTime(preview.pickupAt, "da", props.timeZone)} –{" "}
                      {formatDateTime(preview.returnAt, "da", props.timeZone)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("reschedule.car")}</dt>
                    <dd className="text-ink-900">
                      {preview.registration}{" "}
                      {preview.sameCar ? t("reschedule.sameCar") : t("reschedule.otherCar")}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("reschedule.total")}</dt>
                    <dd className="text-ink-900">
                      {period.price === "new" ? (
                        <>
                          {money(preview.currentTotalMinor)} → {money(preview.newTotalMinor)}
                        </>
                      ) : (
                        money(preview.currentTotalMinor)
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t("pay.status")}</dt>
                    <dd className="text-ink-900">{money(preview.paidMinor)}</dd>
                  </div>
                </dl>
                <form action={props.actions.reschedule}>
                  {hidden}
                  <input type="hidden" name="pickupDate" value={period.pickupDate} />
                  <input type="hidden" name="pickupTime" value={period.pickupTime} />
                  <input type="hidden" name="returnDate" value={period.returnDate} />
                  <input type="hidden" name="returnTime" value={period.returnTime} />
                  <input type="hidden" name="price" value={period.price} />
                  <Button type="submit">{t("reschedule.confirm")}</Button>
                </form>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {props.canChange ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("reassign.title")}</h3>
            {props.carOptions.length === 0 ? (
              <p className="text-sm text-muted">{t("reassign.none")}</p>
            ) : (
              <form action={props.actions.reassign} className="flex flex-col gap-4">
                {hidden}
                <Field label={t("reassign.car")} required>
                  {(field) => (
                    <Select name="carId" {...field}>
                      {props.carOptions.map((car) => (
                        <option key={car.id} value={car.id}>
                          {car.registrationNumber}
                          {car.color ? ` · ${car.color}` : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Button type="submit" variant="secondary" className="self-start">
                  {t("reassign.submit")}
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      ) : null}

      {props.canRefund && props.paidMinor > 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("refund.title")}</h3>
            <p className="text-sm text-muted">
              {t("refund.intro")} {money(props.paidMinor)}
            </p>
            <form action={props.actions.refund} className="flex flex-col gap-4">
              {hidden}
              <Field label={t("refund.amount")} hint={t("amountHint")} required>
                {(field) => <Input name="amount" inputMode="decimal" {...field} />}
              </Field>
              <Field label={t("reason")} hint={t("reasonHint")} required>
                {(field) => <Textarea name="reason" rows={2} {...field} />}
              </Field>
              <Button type="submit" variant="secondary" className="self-start">
                {t("refund.submit")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {props.cancel.allowed ? (
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h3 className="font-semibold text-ink-900">{t("cancel.title")}</h3>
            <p className="text-sm text-muted">
              {props.cancel.free === null
                ? t("cancel.noPolicy")
                : props.cancel.free
                  ? t("cancel.free")
                  : t("cancel.late")}{" "}
              {t("cancel.suggested")} {money(props.cancel.suggestedRefundMinor)}
            </p>
            <form action={props.actions.cancel} className="flex flex-col gap-4">
              {hidden}
              <Field label={t("cancel.refund")} hint={t("cancel.refundHint")} required>
                {(field) => (
                  <Input
                    name="refund"
                    inputMode="decimal"
                    defaultValue={kroner(
                      props.cancel.allowed ? props.cancel.suggestedRefundMinor : 0,
                    )}
                    {...field}
                  />
                )}
              </Field>
              <Field label={t("reason")} hint={t("reasonHint")} required>
                {(field) => <Textarea name="reason" rows={2} {...field} />}
              </Field>
              <Checkbox name="confirm" label={t("cancel.confirm")} required />
              <Button type="submit" variant="danger" className="self-start">
                {t("cancel.submit")}
              </Button>
            </form>
          </CardBody>
        </Card>
      ) : null}
    </section>
  );
}
