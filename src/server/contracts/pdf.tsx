import "server-only";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateTimeFull, formatMoney } from "@/lib/format";
import { contractTranslator, type ContractSnapshot } from "./snapshot";

const BRAND = "#114853";
const MUTED = "#5b6b70";
const LINE = "#d6e1e2";

// lineHeight på siden og `language` på dokumentet får react-pdf 4.9 til at udelade sidefoden med
// sidetal (`render`), så linjeafstand sættes kun på de tekster, der brydes over flere linjer.
const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontSize: 10, fontFamily: "Helvetica", color: "#0f2a30" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: BRAND },
  muted: { color: MUTED },
  section: { marginBottom: 12 },
  heading: { fontSize: 11, fontFamily: "Helvetica-Bold", color: BRAND, marginBottom: 4 },
  columns: { flexDirection: "row", gap: 16 },
  column: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE,
    marginTop: 4,
    paddingTop: 4,
    fontFamily: "Helvetica-Bold",
  },
  term: { marginBottom: 6 },
  termBody: { lineHeight: 1.35 },
  termTitle: { fontFamily: "Helvetica-Bold" },
  signatureBox: { borderWidth: 1, borderColor: LINE, padding: 8, marginTop: 4 },
  signature: { width: 220, height: 80, objectFit: "contain" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: MUTED },
});

export type ContractSignature = { name: string; signedAt: Date; image: Uint8Array };

/** Kontrakten som React-skabelon (02-tech-stack: @react-pdf/renderer, ingen headless browser). */
function ContractPdf({
  snapshot,
  signature,
}: {
  snapshot: ContractSnapshot;
  signature: ContractSignature | null;
}) {
  const t = contractTranslator(snapshot.locale);
  const money = (amountMinor: number) =>
    formatMoney(amountMinor, snapshot.currency, snapshot.locale);
  const when = (iso: string, timeZone: string) =>
    formatDateTimeFull(new Date(iso), snapshot.locale, timeZone);
  return (
    <Document title={t("contract.title")} author={snapshot.landlord.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{t("contract.title")}</Text>
            <Text style={styles.muted}>
              {t("contract.reference", { reference: snapshot.reference })}
            </Text>
          </View>
          <Text style={styles.muted}>
            {t("contract.termsVersion", { version: snapshot.termsVersion })}
          </Text>
        </View>

        <View style={[styles.section, styles.columns]}>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.landlord")}</Text>
            <Text>{snapshot.landlord.name}</Text>
            <Text>{snapshot.landlord.phone}</Text>
            <Text>{snapshot.landlord.email}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.renter")}</Text>
            <Text>{snapshot.renter.name}</Text>
            <Text>{snapshot.renter.email}</Text>
            {snapshot.renter.phone ? <Text>{snapshot.renter.phone}</Text> : null}
          </View>
        </View>

        <View style={[styles.section, styles.columns]}>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.car")}</Text>
            <Text>{snapshot.car.name}</Text>
            <Text>{t("contract.registration", { number: snapshot.car.registrationNumber })}</Text>
          </View>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.period")}</Text>
            <Text>
              {t("contract.pickup")}: {when(snapshot.pickup.at, snapshot.pickup.timeZone)},{" "}
              {snapshot.pickup.location}
            </Text>
            <Text>
              {t("contract.return")}: {when(snapshot.return.at, snapshot.return.timeZone)},{" "}
              {snapshot.return.location}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("contract.price")}</Text>
          {snapshot.items.map((item, index) => (
            <View key={index} style={styles.row}>
              <Text>{item.label}</Text>
              <Text>{money(item.totalMinor)}</Text>
            </View>
          ))}
          <View style={styles.totalRow}>
            <Text>{t("contract.total")}</Text>
            <Text>{money(snapshot.totalMinor)}</Text>
          </View>
        </View>

        <View style={[styles.section, styles.columns]}>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.included")}</Text>
            <Text>{t("car.includedKm", { km: snapshot.includedKmPerDay })}</Text>
            {snapshot.depositMinor > 0 ? (
              <Text>{t("car.deposit", { price: money(snapshot.depositMinor) })}</Text>
            ) : null}
          </View>
          <View style={styles.column}>
            <Text style={styles.heading}>{t("contract.fees")}</Text>
            <Text>{t("car.extraKm", { price: money(snapshot.extraKmFeeMinor) })}</Text>
            <Text>{t("car.fuelFee", { price: money(snapshot.fuelPerEighthMinor) })}</Text>
            <Text>
              {t("car.lateFee", {
                price: money(snapshot.latePerHourMinor),
                minutes: snapshot.graceMinutes,
              })}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("contract.terms")}</Text>
          {snapshot.terms.map((term) => (
            <View key={term.title} style={styles.term} wrap={false}>
              <Text style={styles.termTitle}>{term.title}</Text>
              <Text style={styles.termBody}>{term.body}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.heading}>{t("contract.signature")}</Text>
          {signature ? (
            <View style={styles.signatureBox}>
              {/* react-pdf's Image har ingen alt; navnet står i teksten lige under. */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image
                style={styles.signature}
                src={{ data: Buffer.from(signature.image), format: "png" }}
              />
              <Text>
                {t("contract.signedBy", {
                  name: signature.name,
                  date: formatDateTimeFull(
                    signature.signedAt,
                    snapshot.locale,
                    snapshot.pickup.timeZone,
                  ),
                })}
              </Text>
              <Text style={styles.muted}>{t("contract.signedNote")}</Text>
            </View>
          ) : (
            <Text style={styles.muted}>{t("contract.unsigned")}</Text>
          )}
        </View>

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${snapshot.landlord.name} · ${snapshot.reference} · ${t("contract.page", { page: pageNumber, total: totalPages })}`
          }
        />
      </Page>
    </Document>
  );
}

export async function renderContractPdf(
  snapshot: ContractSnapshot,
  signature: ContractSignature | null,
): Promise<Uint8Array> {
  return new Uint8Array(
    await renderToBuffer(<ContractPdf snapshot={snapshot} signature={signature} />),
  );
}
