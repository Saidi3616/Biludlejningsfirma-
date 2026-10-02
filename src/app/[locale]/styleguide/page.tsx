import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Inbox, Search } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { serverEnv } from "@/lib/env";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Radio, RadioGroup } from "@/components/ui/choice";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { ImagePlaceholder } from "@/components/ui/image-placeholder";
import { Input, Textarea } from "@/components/ui/input";
import { Container } from "@/components/ui/layout";
import { Price } from "@/components/ui/price";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { Rating } from "@/components/ui/rating";
import { Select } from "@/components/ui/select";
import { bookingStatuses, carStatuses, paymentStatuses } from "@/components/ui/status";
import { StatusBadge } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Intern oversigt over designsystemet. Ikke oversat, ikke indekseret, ikke i produktion.
export const metadata: Metadata = { title: "Styleguide", robots: { index: false, follow: false } };

const swatches = [
  {
    name: "brand",
    shades: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"],
  },
  { name: "accent", shades: ["100", "300", "400", "500", "600", "950"] },
  { name: "ink", shades: ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"] },
];

export default async function StyleguidePage({ params }: PageProps<"/[locale]/styleguide">) {
  if (serverEnv().APP_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <Container className="flex flex-col gap-14 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Designsystem</h1>
        <p className="text-lg text-muted">
          Alle genbrugelige komponenter. Skift sprog i headeren for at se RTL (arabisk).
        </p>
      </header>

      <Block title="Farver">
        <div className="flex flex-col gap-4">
          {swatches.map((group) => (
            <div key={group.name} className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-11">
              {group.shades.map((shade) => (
                <div key={shade} className="flex flex-col gap-1">
                  <div
                    className="h-12 rounded-md border border-border"
                    style={{ background: `var(--color-${group.name}-${shade})` }}
                  />
                  <span className="text-xs text-muted">
                    {group.name}-{shade}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Block>

      <Block title="Typografi">
        <div className="flex flex-col gap-3">
          <p className="text-(length:--text-display) leading-(--text-display--line-height) font-semibold tracking-(--text-display--letter-spacing)">
            Find din bil.
          </p>
          <p className="text-3xl font-semibold tracking-tight">Overskrift 1</p>
          <p className="text-2xl font-semibold tracking-tight">Overskrift 2</p>
          <p className="text-lg font-semibold">Overskrift 3</p>
          <p className="text-base">
            Brødtekst. Kunden skal kunne leje en bil uden at skulle tænke.
          </p>
          <p className="text-sm text-muted">Hjælpetekst og metadata.</p>
          <p className="text-base" lang="ar" dir="rtl">
            اعثر على سيارتك. احجز في دقائق.
          </p>
        </div>
      </Block>

      <Block title="Knapper">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="cta" size="lg">
            <Search aria-hidden /> Find biler
          </Button>
          <Button>Primær</Button>
          <Button variant="secondary">Sekundær</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Annullér booking</Button>
          <Button variant="whatsapp">WhatsApp</Button>
          <Button variant="link">Link</Button>
          <Button loading>Gemmer</Button>
          <Button disabled>Deaktiveret</Button>
          <Button size="sm">Lille</Button>
        </div>
      </Block>

      <Block title="Formularer">
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <Field label="Fulde navn" required hint="Som det står på dit kørekort.">
            {(props) => <Input autoComplete="name" {...props} />}
          </Field>
          <Field label="E-mail" required error="Indtast en gyldig e-mailadresse.">
            {(props) => <Input type="email" defaultValue="anna@" {...props} />}
          </Field>
          <Field label="Afhentningssted">
            {(props) => (
              <Select defaultValue="cph" {...props}>
                <option value="cph">København</option>
                <option value="cph-airport">Københavns Lufthavn</option>
                <option value="aar">Aarhus</option>
              </Select>
            )}
          </Field>
          <Field label="Afhentningsdato">{(props) => <Input type="date" {...props} />}</Field>
          <Field label="Besked" className="sm:col-span-2">
            {(props) => <Textarea {...props} />}
          </Field>
          <RadioGroup legend="Hvordan vil du have bilen?">
            <Radio name="fulfilment" defaultChecked label="Afhent bilen hos os" />
            <Radio
              name="fulfilment"
              label="Få bilen leveret"
              description="Pris afhænger af adressen."
            />
          </RadioGroup>
          <div className="flex flex-col gap-3">
            <Checkbox label="Jeg accepterer lejebetingelserne" />
            <Checkbox
              label="Send mig bookingbeskeder på WhatsApp"
              description="Du kan altid framelde."
            />
            <label className="flex items-center gap-3">
              <Switch aria-label="Notifikationer" defaultChecked />
              <span>Notifikationer</span>
            </label>
          </div>
        </div>
      </Block>

      <Block title="Kort">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <ImagePlaceholder
              subject="Toyota Corolla Hybrid, hvid, 3/4 forfra, lys studiebaggrund"
              format="Professionel bilfotografering"
              ratio="4/3"
              className="rounded-b-none border-0"
            />
            <CardHeader>
              <CardTitle>Toyota Corolla</CardTitle>
              <p className="text-sm text-muted">Automatgear · 5 personer · 3 kufferter</p>
            </CardHeader>
            <CardBody className="flex items-baseline gap-1">
              <Price amountMinor={39900} currency="DKK" className="text-2xl font-semibold" />
              <span className="text-sm text-muted">/ dag</span>
            </CardBody>
            <CardFooter>
              <Button fullWidth>Se bil</Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Prisoversigt</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 text-base">
              <Row label="Leje, 3 dage" value={<Price amountMinor={99900} currency="DKK" />} />
              <Row label="Barnestol" value={<Price amountMinor={15000} currency="DKK" />} />
              <Row label="Rabat" value={<Price amountMinor={-10000} currency="DKK" />} />
              <div className="border-t border-border pt-2">
                <Row
                  label={<strong>Total</strong>}
                  value={<Price amountMinor={104900} currency="DKK" className="font-semibold" />}
                />
              </div>
              <Row
                label="Depositum (reserveres)"
                value={<Price amountMinor={300000} currency="DKK" />}
              />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex flex-col gap-2">
              <Rating value={4} label="4 ud af 5 stjerner" />
              <p className="text-base">&ldquo;Nem booking og bilen var klar til tiden.&rdquo;</p>
              <p className="text-sm text-muted">Anna J. · 12. september 2026</p>
            </CardBody>
          </Card>
        </div>
      </Block>

      <Block title="Status-badges">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {bookingStatuses.map((s) => (
              <StatusBadge key={s} kind="booking" status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {paymentStatuses.map((s) => (
              <StatusBadge key={s} kind="payment" status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {carStatuses.map((s) => (
              <StatusBadge key={s} kind="car" status={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">SUV</Badge>
            <Badge>Automatgear</Badge>
          </div>
        </div>
      </Block>

      <Block title="Beskeder">
        <div className="flex max-w-2xl flex-col gap-3">
          <Alert tone="info" title="Depositum">
            Reserveres på dit kort ved afhentning og trækkes ikke.
          </Alert>
          <Alert tone="success" title="Din betaling er modtaget" />
          <Alert tone="warning" title="Din reservation udløber om 5 minutter" />
          <Alert tone="danger" title="Betalingen blev afvist">
            Prøv et andet kort, eller kontakt os på WhatsApp.
          </Alert>
        </div>
      </Block>

      <Block title="Dialog og ark">
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Åbn dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Annullér booking?"
              description="Du får 999 kr. refunderet."
              closeLabel="Luk"
            >
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary">Behold booking</Button>
                </DialogClose>
                <Button variant="danger">Annullér</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Åbn ark (filtre)</Button>
            </DialogTrigger>
            <DialogContent variant="sheet" title="Filtre" closeLabel="Luk">
              <Checkbox label="Automatgear" />
              <Checkbox label="Elbil" />
              <Button>Vis 12 biler</Button>
            </DialogContent>
          </Dialog>
        </div>
      </Block>

      <Block title="Navigation og trin">
        <div className="flex flex-col gap-8">
          <ProgressSteps
            label="Bookingtrin"
            steps={["Ekstraudstyr", "Dine oplysninger", "Gennemse", "Betaling"]}
            current={1}
          />
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Detaljer</TabsTrigger>
              <TabsTrigger value="payment">Betaling</TabsTrigger>
              <TabsTrigger value="inspections">Inspektioner</TabsTrigger>
            </TabsList>
            <TabsContent value="details">Bookingdetaljer.</TabsContent>
            <TabsContent value="payment">Betalinger og depositum.</TabsContent>
            <TabsContent value="inspections">Før/efter-billeder.</TabsContent>
          </Tabs>
          <Accordion type="single" collapsible className="max-w-2xl">
            <AccordionItem value="a">
              <AccordionTrigger>Hvad skal jeg medbringe ved afhentning?</AccordionTrigger>
              <AccordionContent>
                Gyldigt kørekort og det betalingskort, du bookede med.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Kan jeg annullere?</AccordionTrigger>
              <AccordionContent>Ja, efter annulleringspolitikken.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </Block>

      <Block title="Tabel">
        <Table label="Dagens bookinger">
          <THead>
            <TR>
              <TH>Reference</TH>
              <TH>Kunde</TH>
              <TH>Bil</TH>
              <TH>Afhentning</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <tbody>
            <TR>
              <TD className="font-mono">BK-7Q4F2</TD>
              <TD>Anna J.</TD>
              <TD>Corolla · AB 12 345</TD>
              <TD>09:00</TD>
              <TD>
                <StatusBadge kind="booking" status="CONFIRMED" />
              </TD>
            </TR>
            <TR>
              <TD className="font-mono">BK-2M9XC</TD>
              <TD>Omar K.</TD>
              <TD>Tiguan · CD 67 890</TD>
              <TD>11:30</TD>
              <TD>
                <StatusBadge kind="booking" status="ACTIVE" />
              </TD>
            </TR>
          </tbody>
        </Table>
      </Block>

      <Block title="Indlæsning og tomme tilstande">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <Spinner label="Indlæser" />
          </div>
          <EmptyState
            icon={<Inbox />}
            title="Ingen bookinger endnu"
            description="Når du booker en bil, kan du se den her."
            action={<Button>Find en bil</Button>}
          />
        </div>
      </Block>
    </Container>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="border-b border-border pb-2 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
