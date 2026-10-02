"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Radio, RadioGroup } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { locales } from "@/i18n/routing";
import type { PhoneBookingState } from "@/app/admin/bookings/new/actions";

type Action = (state: PhoneBookingState, formData: FormData) => Promise<PhoneBookingState>;

type Options = {
  models: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  extras: { code: string; name: string }[];
};

/** F3: telefon- og skrankebooking. Felterne beholder deres værdier, hvis noget fejler. */
export function PhoneBookingForm({
  action,
  options,
  defaults,
}: {
  action: Action;
  options: Options;
  defaults: { pickupDate: string; returnDate: string };
}) {
  const t = useTranslations("admin.newBooking");
  const tLanguage = useTranslations("language");
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? {};
  const value = (name: keyof NonNullable<PhoneBookingState["values"]>, fallback = "") =>
    (values[name] as string | undefined) ?? fallback;
  const invalid = (name: string) => (state.fields?.includes(name) ? t("required") : undefined);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error ? <Alert tone="danger">{t(`errors.${state.error}`)}</Alert> : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("customerTitle")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("firstName")} required error={invalid("firstName")}>
            {(props) => <Input name="firstName" defaultValue={value("firstName")} {...props} />}
          </Field>
          <Field label={t("lastName")} required error={invalid("lastName")}>
            {(props) => <Input name="lastName" defaultValue={value("lastName")} {...props} />}
          </Field>
          <Field label={t("email")} required error={invalid("email")}>
            {(props) => (
              <Input name="email" type="email" dir="ltr" defaultValue={value("email")} {...props} />
            )}
          </Field>
          <Field
            label={t("phone")}
            hint={t("phoneHint")}
            required
            error={state.fields?.includes("phone") ? t("phoneError") : undefined}
          >
            {(props) => (
              <Input name="phone" type="tel" dir="ltr" defaultValue={value("phone")} {...props} />
            )}
          </Field>
          <Field label={t("locale")} hint={t("localeHint")}>
            {(props) => (
              <Select name="locale" defaultValue={value("locale", "da")} {...props}>
                {locales.map((locale) => (
                  <option key={locale} value={locale}>
                    {tLanguage(locale)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink-900">{t("rentalTitle")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("car")} required error={invalid("carModelId")}>
            {(props) => (
              <Select name="carModelId" defaultValue={value("carModelId")} {...props}>
                <option value="">{t("choose")}</option>
                {options.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("pickupLocation")} required error={invalid("pickupLocationId")}>
            {(props) => (
              <Select
                name="pickupLocationId"
                defaultValue={value("pickupLocationId", options.locations[0]?.id)}
                {...props}
              >
                {options.locations.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("pickupDate")} required error={invalid("pickupDate")}>
            {(props) => (
              <Input
                type="date"
                name="pickupDate"
                defaultValue={value("pickupDate", defaults.pickupDate)}
                {...props}
              />
            )}
          </Field>
          <Field label={t("pickupTime")} required error={invalid("pickupTime")}>
            {(props) => (
              <Input
                type="time"
                step={900}
                name="pickupTime"
                defaultValue={value("pickupTime", "10:00")}
                {...props}
              />
            )}
          </Field>
          <Field label={t("returnLocation")} required error={invalid("returnLocationId")}>
            {(props) => (
              <Select
                name="returnLocationId"
                defaultValue={value("returnLocationId", options.locations[0]?.id)}
                {...props}
              >
                {options.locations.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("returnDate")} required error={invalid("returnDate")}>
            {(props) => (
              <Input
                type="date"
                name="returnDate"
                defaultValue={value("returnDate", defaults.returnDate)}
                {...props}
              />
            )}
          </Field>
          <Field label={t("returnTime")} required error={invalid("returnTime")}>
            {(props) => (
              <Input
                type="time"
                step={900}
                name="returnTime"
                defaultValue={value("returnTime", "10:00")}
                {...props}
              />
            )}
          </Field>
          <Field label={t("discountCode")} error={invalid("discountCode")}>
            {(props) => (
              <Input name="discountCode" defaultValue={value("discountCode")} {...props} />
            )}
          </Field>
        </div>
        {options.extras.length > 0 ? (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium text-ink-900">{t("extras")}</legend>
            {options.extras.map((extra) => (
              <Checkbox
                key={extra.code}
                name="extras"
                value={extra.code}
                defaultChecked={values.extras?.includes(extra.code)}
                label={extra.name}
              />
            ))}
          </fieldset>
        ) : null}
      </fieldset>

      <RadioGroup legend={t("paymentTitle")}>
        <Radio
          name="payment"
          value="link"
          defaultChecked={value("payment", "link") === "link"}
          label={t("paymentLink")}
          description={t("paymentLinkHint")}
        />
        <Radio
          name="payment"
          value="counter"
          defaultChecked={value("payment") === "counter"}
          label={t("paymentCounter")}
          description={t("paymentCounterHint")}
        />
      </RadioGroup>

      <Button type="submit" loading={pending} className="self-start">
        {t("submit")}
      </Button>
    </form>
  );
}
