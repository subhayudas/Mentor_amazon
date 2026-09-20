import { useTranslation } from "react-i18next";

import { Container } from "@/components/layout/Container";

/** `/legal`: the programme's disclaimer, terms and privacy notice (the existing `legal.*` copy) on one page. */
export default function Legal() {
  const { t } = useTranslation();
  const block = "mt-10 max-w-[760px]";
  return (
    <div className="bg-white">
      <section className="bg-[var(--sc-peach)]">
        <Container className="pb-8 pt-10 md:pb-10 md:pt-14">
          <h1 id="page-title" tabIndex={-1} className="font-serif-display text-[40px] font-normal leading-[1] tracking-[-0.04em] text-[var(--sc-ink)] md:text-[60px]">
            {t("showcase.footer.legal")}
          </h1>
        </Container>
      </section>
      <Container className="pb-16">
        <section id="terms" className={block} aria-labelledby="terms-title">
          <h2 id="terms-title" className="text-[24px] font-bold text-[var(--sc-ink)]">
            {t("showcase.legal.terms")}
          </h2>
          <p className="mt-4 text-[16px] leading-[28px] text-[var(--sc-ink-soft)] text-pretty">{t("legal.termsAgreement")}</p>
          <p className="mt-4 text-[16px] leading-[28px] text-[var(--sc-ink-soft)] text-pretty">{t("legal.disclaimer")}</p>
        </section>
        <section id="privacy" className={block} aria-labelledby="privacy-title">
          <h2 id="privacy-title" className="text-[24px] font-bold text-[var(--sc-ink)]">
            {t("showcase.legal.privacy")}
          </h2>
          <p className="mt-4 text-[16px] leading-[28px] text-[var(--sc-ink-soft)] text-pretty">{t("legal.privacyNotice")}</p>
        </section>
      </Container>
    </div>
  );
}
