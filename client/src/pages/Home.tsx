import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Mentor } from "@shared/schema";
import { MentorCard } from "@/components/MentorCard";
import { SearchAndFilter } from "@/components/SearchAndFilter";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NumberTicker, ScrambleHover } from "@/components/fancy/FancyComponents";
import { ArrowRight, Sparkles, MessageCircle, Target, Zap, Globe, ChevronRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "wouter";

export default function Home() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const [filters, setFilters] = useState({ search: "", expertise: "", industry: "", language: "" });

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (filters.search) params.append("search", filters.search);
    if (filters.expertise && filters.expertise !== "all") params.append("expertise", filters.expertise);
    if (filters.industry && filters.industry !== "all") params.append("industry", filters.industry);
    if (filters.language && filters.language !== "all") params.append("language", filters.language);
    return params.toString();
  };

  const queryParams = buildQueryParams();
  const apiUrl = queryParams ? `/api/mentors?${queryParams}` : "/api/mentors";

  const { data: mentors, isLoading } = useQuery<Mentor[]>({ queryKey: [apiUrl] });
  const allMentors = mentors;

  const handleFilterChange = useCallback((newFilters: { search: string; expertise: string; industry: string; language: string }) => {
    setFilters(newFilters);
  }, []);

  const activeFilterCount = [
    filters.search,
    filters.expertise && filters.expertise !== "all",
    filters.industry && filters.industry !== "all",
    filters.language && filters.language !== "all"
  ].filter(Boolean).length;

  const pastelColors: Array<'pink' | 'mint' | 'purple' | 'coral' | 'blue'> = ['pink', 'mint', 'purple', 'coral', 'blue'];
  const getCardColor = (index: number): 'pink' | 'mint' | 'purple' | 'coral' | 'blue' => pastelColors[index % pastelColors.length];

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)' }}>

      {/* ========== HERO SECTION ========== */}
      <section className="hero-mesh relative py-20 md:py-32 overflow-hidden">
        {/* Floating decorative elements */}
        <motion.div
          className="absolute top-20 right-[15%] w-20 h-20 rounded-3xl float-slow"
          style={{ background: 'var(--pastel-peach)', opacity: 0.6 }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.6, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        />
        <motion.div
          className="absolute bottom-32 left-[10%] w-16 h-16 rounded-2xl float-slow"
          style={{ background: 'var(--pastel-lavender)', opacity: 0.5, animationDelay: '2s' }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 0.5, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
        />
        <motion.div
          className="absolute top-40 left-[20%] w-12 h-12 rounded-full float-slow"
          style={{ background: 'var(--pastel-sage)', opacity: 0.4, animationDelay: '4s' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 0.9, duration: 0.8 }}
        />

        <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-8 text-center">
          {/* Badge */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8"
            style={{ background: 'var(--pastel-butter)', border: '1px solid rgba(255, 153, 0, 0.15)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'var(--amazon-orange)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {t('hero.badge')}
            </span>
          </motion.div>

          {/* Main Headline */}
          <motion.h1
            className="mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            {isArabic ? (
              <>
                اعثر على <span className="italic">مرشدك</span>
                <br />
                <span className="relative inline-block">
                  المثالي
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    viewBox="0 0 200 12"
                    fill="none"
                    style={{ height: '0.15em' }}
                  >
                    <path
                      d="M2 8 Q100 2 198 8"
                      stroke="var(--amazon-orange)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </span>
              </>
            ) : (
              <>
                Find your <span className="italic">perfect</span>
                <br />
                <span className="relative inline-block">
                  mentor
                  <svg
                    className="absolute -bottom-2 left-0 w-full"
                    viewBox="0 0 200 12"
                    fill="none"
                    style={{ height: '0.15em' }}
                  >
                    <path
                      d="M2 8 Q100 2 198 8"
                      stroke="var(--amazon-orange)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      fill="none"
                    />
                  </svg>
                </span>
              </>
            )}
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            className="text-xl md:text-2xl mb-6"
            style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--amazon-orange)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {t('hero.tagline')}
          </motion.p>

          {/* Description */}
          <motion.p
            className="text-lg max-w-2xl mx-auto mb-10"
            style={{ color: 'var(--ink-light)', lineHeight: 1.7 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {t('hero.shortNarrative')}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            className="flex flex-wrap gap-4 justify-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <a href="#mentors">
              <button className="btn-primary text-lg group">
                {t('nav.browseMentors')}
                <ArrowRight className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${isArabic ? 'rotate-180' : ''}`} />
              </button>
            </a>
            <Link href="/mentee-registration">
              <button className="btn-outline text-lg">
                {t('nav.joinMentee')}
              </button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ========== FEATURE CARDS - ASYMMETRIC BENTO ========== */}
      <section className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6 md:px-8">

          {/* Asymmetric Grid */}
          <div className="grid grid-cols-12 gap-4 md:gap-6">

            {/* Large Card - Personal Mentorship */}
            <motion.div
              className="feature-card card-blush col-span-12 md:col-span-7 min-h-[320px] flex flex-col justify-between"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
            >
              <div>
                <div className="inline-flex p-3 rounded-2xl mb-6" style={{ background: 'rgba(255, 182, 193, 0.5)' }}>
                  <MessageCircle className="w-6 h-6" style={{ color: '#E75480' }} />
                </div>
                <h3 className="mb-4" style={{ fontFamily: 'var(--font-display)' }}>
                  {isArabic ? 'إرشاد فردي' : '1:1 Mentorship'}
                </h3>
                <p style={{ color: 'var(--ink-light)', fontSize: '1.1rem', lineHeight: 1.7 }}>
                  {isArabic
                    ? 'احجز جلسات مخصصة مع قادة أمازون. احصل على ملاحظات مباشرة حول مشاريعك وقراراتك المهنية ومسار نموك.'
                    : 'Book personalized sessions with Amazon leaders. Get direct feedback on your projects, career decisions, and growth trajectory.'
                  }
                </p>
              </div>
              <div className="mt-8">
                <Link href="/mentee-registration" className="group inline-flex items-center gap-2 font-semibold" style={{ color: 'var(--ink)' }}>
                  <ScrambleHover>{isArabic ? 'ابدأ الآن' : 'Get Started'}</ScrambleHover>
                  <ChevronRight className={`w-4 h-4 transition-transform group-hover:translate-x-1 ${isArabic ? 'rotate-180' : ''}`} />
                </Link>
              </div>
              <div className="card-deco" />
            </motion.div>

            {/* Stats Card */}
            <motion.div
              className="feature-card card-sage col-span-12 md:col-span-5 flex flex-col justify-center"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="stat-value">
                    <NumberTicker target={mentors?.length || 50} suffix="+" />
                  </div>
                  <div className="stat-label mt-1">{t('stats.activeMentors')}</div>
                </div>
                <div>
                  <div className="stat-value">
                    <NumberTicker target={500} duration={2.5} suffix="+" />
                  </div>
                  <div className="stat-label mt-1">{t('stats.sessionsBooked')}</div>
                </div>
                <div>
                  <div className="stat-value">
                    <NumberTicker target={12} suffix="+" />
                  </div>
                  <div className="stat-label mt-1">{t('stats.countries')}</div>
                </div>
                <div>
                  <div className="stat-value">
                    <NumberTicker target={98} suffix="%" />
                  </div>
                  <div className="stat-label mt-1">{t('stats.satisfaction')}</div>
                </div>
              </div>
            </motion.div>

            {/* Career Goals */}
            <motion.div
              className="feature-card card-lavender col-span-12 md:col-span-4"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="inline-flex p-3 rounded-2xl mb-4" style={{ background: 'rgba(201, 182, 228, 0.5)' }}>
                <Target className="w-6 h-6" style={{ color: '#7C3AED' }} />
              </div>
              <h3 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                {isArabic ? 'حدد أهدافك' : 'Set Goals'}
              </h3>
              <p style={{ color: 'var(--ink-light)' }}>
                {isArabic
                  ? 'أهداف واضحة مع توجيه من الذين سبقوك في المسار.'
                  : "Clear objectives with guidance from those who've walked the path."
                }
              </p>
            </motion.div>

            {/* Fast Growth */}
            <motion.div
              className="feature-card card-peach col-span-12 md:col-span-4"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <div className="inline-flex p-3 rounded-2xl mb-4" style={{ background: 'rgba(255, 179, 153, 0.5)' }}>
                <Zap className="w-6 h-6" style={{ color: '#EA580C' }} />
              </div>
              <h3 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                {isArabic ? 'نمو سريع' : 'Fast Growth'}
              </h3>
              <p style={{ color: 'var(--ink-light)' }}>
                {isArabic
                  ? 'تخطى سنوات من التجربة والخطأ برؤى من كبار الأمازونيين.'
                  : 'Skip years of trial and error with insights from senior Amazonians.'
                }
              </p>
            </motion.div>

            {/* Global Network */}
            <motion.div
              className="feature-card card-sky col-span-12 md:col-span-4"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="inline-flex p-3 rounded-2xl mb-4" style={{ background: 'rgba(135, 206, 235, 0.5)' }}>
                <Globe className="w-6 h-6" style={{ color: '#0284C7' }} />
              </div>
              <h3 className="text-2xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
                {isArabic ? 'شبكة عالمية' : 'Global Network'}
              </h3>
              <p style={{ color: 'var(--ink-light)' }}>
                {isArabic
                  ? 'تواصل مع مرشدين من أكثر من 12 دولة وخلفيات متنوعة.'
                  : 'Connect with mentors across 12+ countries and diverse backgrounds.'
                }
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== MENTORS SECTION ========== */}
      <section id="mentors" className="py-20 md:py-28" style={{ background: 'white' }}>
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-12">
            <motion.h2
              className="mb-4"
              style={{ fontFamily: 'var(--font-display)' }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              {t('mentors.featured')}
            </motion.h2>
            <p style={{ color: 'var(--ink-light)', fontSize: '1.125rem' }}>
              {t('mentors.browseDescription')}
            </p>
            {activeFilterCount > 0 && (
              <Badge className="mt-4 rounded-full px-4 py-1" style={{ background: 'var(--pastel-butter)', color: 'var(--ink)' }}>
                {activeFilterCount} {isArabic ? 'فلتر نشط' : (activeFilterCount > 1 ? 'filters' : 'filter')} {isArabic ? '' : 'active'}
              </Badge>
            )}
          </div>

          {/* Search and Filter */}
          {allMentors && (
            <SearchAndFilter mentors={allMentors} onFilterChange={handleFilterChange} />
          )}

          {/* Mentor Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="p-6 rounded-3xl bg-white">
                  <Skeleton className="w-20 h-20 rounded-2xl mb-4" />
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <div className="flex gap-2 mb-4">
                    <Skeleton className="h-6 w-16 rounded-full" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-12 w-full rounded-xl" />
                </Card>
              ))}
            </div>
          ) : mentors && mentors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-10">
              {mentors.map((mentor, index) => (
                <motion.div
                  key={mentor.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                >
                  <MentorCard mentor={mentor} accentColor={getCardColor(index)} />
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center rounded-3xl mt-10">
              <p style={{ color: 'var(--ink-muted)' }}>
                {activeFilterCount > 0 ? t('mentors.noResultsFilter') : t('mentors.noResults')}
              </p>
            </Card>
          )}
        </div>
      </section>

      {/* ========== FAQ SECTION ========== */}
      <section className="py-20 md:py-28" style={{ background: 'var(--cream)' }}>
        <div className="max-w-3xl mx-auto px-6 md:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="mb-4" style={{ fontFamily: 'var(--font-display)' }}>
              {t('faq.title')}
            </h2>
            <p style={{ color: 'var(--ink-muted)' }}>{t('faq.subtitle')}</p>
          </motion.div>

          <Accordion type="single" collapsible className="w-full space-y-3">
            {[
              { value: "spam", question: t('faq.spamQuestion'), answer: t('faq.spamAnswer') },
              { value: "commitment", question: t('faq.commitmentQuestion'), answer: t('faq.commitmentAnswer') },
              { value: "matching", question: t('faq.matchingQuestion'), answer: t('faq.matchingAnswer') },
              { value: "cancel", question: t('faq.cancelQuestion'), answer: t('faq.cancelAnswer') },
            ].map((faq) => (
              <AccordionItem
                key={faq.value}
                value={faq.value}
                className="bg-white rounded-2xl px-6 border-none data-[state=open]:shadow-sm"
              >
                <AccordionTrigger className="text-left hover:no-underline py-5 font-medium text-[var(--ink)]">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-[var(--ink-light)]">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ========== VEROSEK-STYLE FOOTER ========== */}
      <footer className="relative py-20 md:py-28 overflow-hidden" style={{ background: 'var(--cream)' }}>
        {/* Background shader gradient - warm orange tones */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 30% 70%, rgba(255, 153, 0, 0.08) 0%, transparent 50%),
              radial-gradient(ellipse 60% 40% at 70% 50%, rgba(255, 173, 51, 0.06) 0%, transparent 50%)
            `,
          }}
        />

        <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-8">
          {/* Top section - Newsletter + Navigation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            {/* Newsletter */}
            <div>
              <h4 className="text-lg font-semibold mb-4" style={{ color: 'var(--ink)' }}>
                {isArabic ? 'انضم إلينا' : 'Join Waitlist'}
              </h4>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder={isArabic ? 'بريدك الإلكتروني' : 'Your email'}
                  className="flex-1 px-4 py-3 rounded-xl border border-[var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--amazon-orange)] focus:border-transparent"
                />
                <button
                  className="px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:brightness-110"
                  style={{
                    background: 'var(--amazon-orange)',
                    color: 'white',
                  }}
                >
                  {isArabic ? 'إرسال' : 'Submit'}
                </button>
              </div>
            </div>

            {/* Navigation Links */}
            <div>
              <h4 className="text-lg font-semibold mb-4" style={{ color: 'var(--ink)' }}>
                {isArabic ? 'التنقل' : 'Navigation'}
              </h4>
              <ul className="space-y-3">
                <li>
                  <Link href="/" className="text-[var(--ink-light)] hover:text-[var(--amazon-orange)] transition-colors">
                    {t('nav.home')}
                  </Link>
                </li>
                <li>
                  <Link href="/mentee-registration" className="text-[var(--ink-light)] hover:text-[var(--amazon-orange)] transition-colors">
                    {t('nav.joinMentee')}
                  </Link>
                </li>
                <li>
                  <Link href="/mentor-onboarding" className="text-[var(--ink-light)] hover:text-[var(--amazon-orange)] transition-colors">
                    {t('nav.becomeMentor')}
                  </Link>
                </li>
                <li>
                  <Link href="/analytics" className="text-[var(--ink-light)] hover:text-[var(--amazon-orange)] transition-colors">
                    {t('nav.analytics')}
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[var(--border)] mb-8" />

          {/* Copyright */}
          <div className="text-center text-sm" style={{ color: 'var(--ink-muted)' }}>
            © 2025 amazon. {t('footer.allRightsReserved')}
          </div>
        </div>

        {/* Large "amazon" text - Verosek style with orange */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full text-center pointer-events-none select-none overflow-hidden"
          style={{
            fontSize: 'clamp(8rem, 25vw, 20rem)',
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            color: 'var(--amazon-orange)',
            opacity: 0.25,
            lineHeight: 0.8,
            letterSpacing: '-0.05em',
          }}
        >
          amazon
        </div>
      </footer>
    </div>
  );
}
