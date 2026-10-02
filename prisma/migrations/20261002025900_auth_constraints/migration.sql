-- Håndskrevne constraints til auth-tabellerne (Prisma kan ikke udtrykke CHECK).

-- Kun understøttede sprog.
ALTER TABLE "User" ADD CONSTRAINT "user_locale_valid" CHECK ("locale" IN ('da', 'en', 'ar', 'fr'));

-- E-mails gemmes altid med små bogstaver, så den unikke nøgle ikke kan omgås med store bogstaver.
ALTER TABLE "User" ADD CONSTRAINT "user_email_lowercase" CHECK ("email" = lower("email"));
