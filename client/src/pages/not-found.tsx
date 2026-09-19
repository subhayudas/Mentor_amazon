import { Link } from "wouter";
import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { lastDiscoveryHref } from "@/lib/urlState";

/**
 * The only 404 (vercel.json rewrites every non-/api path here). One
 * hierarchy (F-44): the PageHeader carries the eyebrow, the h1, the one
 * sentence and the two exits — no second heading, no illustration. The
 * route-change effect focuses the h1.
 */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Container className="pb-16">
      <PageHeader
        eyebrow="404"
        title={t("errors.notFoundTitle")}
        description={t("errors.notFoundBody")}
        actions={
          <>
            <Button asChild variant="secondary" data-testid="button-notfound-home">
              <Link href={ROUTES.home}>{t("errors.notFoundHome")}</Link>
            </Button>
            <Button asChild variant="outline" data-testid="button-notfound-mentors">
              <Link href={lastDiscoveryHref()}>{t("errors.notFoundBrowse")}</Link>
            </Button>
          </>
        }
      />
    </Container>
  );
}
