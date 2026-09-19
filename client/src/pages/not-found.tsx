import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { SearchX } from "lucide-react";

import { Container } from "@/components/layout/Container";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/routes";
import { lastDiscoveryHref } from "@/lib/urlState";

/** The only 404 (vercel.json rewrites every non-/api path here). The route-change effect focuses the h1. */
export default function NotFound() {
  const { t } = useTranslation();
  return (
    <Container className="pb-16">
      <PageHeader eyebrow="404" title={t("errors.notFoundTitle")} description={t("errors.notFoundBody")} />
      <EmptyState
        icon={SearchX}
        titleAs="p"
        title={t("errors.notFoundNext")}
        className="py-6"
        action={
          <Button asChild variant="secondary" data-testid="button-notfound-home">
            <Link href={ROUTES.home}>{t("errors.notFoundHome")}</Link>
          </Button>
        }
        secondaryAction={
          <Button asChild variant="outline" data-testid="button-notfound-mentors">
            <Link href={lastDiscoveryHref()}>{t("errors.notFoundBrowse")}</Link>
          </Button>
        }
      />
    </Container>
  );
}
