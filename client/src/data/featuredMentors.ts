/**
 * Curated mentors shown on the landing (hero wall + "Meet the mentors" rail)
 * and served as the directory in demo mode. Each entry is a full
 * `PublicMentor` so every existing surface (cards, filters, profile) can read
 * it, plus the showcase extras the Figma profile / session pages display.
 * Photos live in client/public/mentors/. Bios are written from the mentors'
 * public LinkedIn / Crunchbase profiles.
 */

import type { Mentor, PublicMentor } from "@/lib/database";
import { localStore } from "@/lib/localStore";

export interface Testimonial {
  name: string;
  role?: string;
  date?: string;
  quote: string;
}

export interface FeaturedMentor extends PublicMentor {
  /**
   * The `mentors.id` this entry has in the database: UUIDv5 (URL namespace) of
   * `https://mentor-amazon.vercel.app/mentor/<slug>` for the curated five, the
   * row id itself for onboarded mentors. `id` stays the public slug.
   */
  dbId: string;
  /** Short line under the name on cards ("Founder & CEO, Brinc"). */
  headline: string;
  headline_ar: string;
  /** Wall-card chip (company). */
  chip: string;
  /** Hero-wall image tint (the Figma alternates green / orange / purple duotones). */
  tint: "orange" | "green" | "purple";
  rating: string;
  ratings: number;
  bookings: string;
  /** The 1:1 offer shown as the service card on the profile and on the session page. */
  session: {
    title: string;
    title_ar: string;
    subtitle: string;
    subtitle_ar: string;
    minutes: number;
    intro: string;
    intro_ar: string;
    forWho: string[];
    forWho_ar: string[];
    learn: string[];
    learn_ar: string[];
  };
  testimonials: Testimonial[];
  faq: { q: string; a: string }[];
  linkedin: string;
  /** Cal.com username or username/event; embedded on the session page when present. */
  cal_link?: string;
}

const now = "2026-09-01T00:00:00.000Z";

export const FEATURED_MENTORS: FeaturedMentor[] = [
  {
    id: "manav-gupta",
    dbId: "738d7465-42c6-5550-be9a-6e7ef35f52bc",
    name: "Manav Gupta",
    name_ar: "ماناف غوبتا",
    company: "Brinc",
    company_ar: "برينك",
    position: "Founder & CEO",
    position_ar: "المؤسس والرئيس التنفيذي",
    timezone: "Asia/Dubai",
    country: "United Arab Emirates",
    photo_url: "/mentors/manav.jpg",
    bio: "Manav founded Brinc in 2014 and has grown it into a global venture accelerator with offices across Hong Kong, Dubai, Bahrain and India that has backed more than 200 startups in climate tech, food tech, Web3 and IoT. Before Brinc he was Managing Director at FabriQate, building interactive products for multinational clients across Asia. He studied at Purdue University and The Hong Kong Polytechnic University, and mentors founders on fundraising, go-to-market and building companies across borders.",
    bio_ar: "أسّس ماناف شركة برينك عام 2014 وحوّلها إلى مسرّع أعمال عالمي بمكاتب في هونغ كونغ ودبي والبحرين والهند، دعم أكثر من 200 شركة ناشئة في تقنيات المناخ والغذاء وويب3 وإنترنت الأشياء. قبل ذلك كان مديراً تنفيذياً في FabriQate. درس في جامعة بيردو وجامعة هونغ كونغ للفنون التطبيقية، ويرشد المؤسسين في جمع التمويل والدخول إلى الأسواق وبناء الشركات عبر الحدود.",
    expertise: ["Fundraising", "Go-to-market", "Company building", "Hardware & IoT"],
    expertise_ar: ["جمع التمويل", "الدخول إلى السوق", "بناء الشركات", "الأجهزة وإنترنت الأشياء"],
    industries: ["Venture capital", "Climate tech", "Web3"],
    industries_ar: ["رأس المال المغامر", "تقنيات المناخ", "ويب3"],
    languages_spoken: ["English", "Hindi"],
    mentorship_preference: "either",
    is_available: true,
    average_rating: "4.9",
    total_ratings: 412,
    created_at: now,
    headline: "Founder & CEO, Brinc",
    headline_ar: "المؤسس والرئيس التنفيذي، برينك",
    chip: "Brinc",
    tint: "green",
    rating: "4.9/5",
    ratings: 412,
    bookings: "1.8k",
    session: {
      title: "Fundraising & Company Building",
      title_ar: "جمع التمويل وبناء الشركة",
      subtitle: "Founder office hours with Manav",
      subtitle_ar: "ساعات مكتبية للمؤسسين مع ماناف",
      minutes: 30,
      intro: "Are you raising a round, entering a new market or deciding what to build next? Book a one-on-one call with Manav.",
      intro_ar: "هل تجمع جولة تمويل أو تدخل سوقاً جديدة أو تقرّر ما ستبنيه بعد ذلك؟ احجز مكالمة فردية مع ماناف.",
      forWho: [
        "Founders preparing a pre-seed or seed round",
        "Operators moving from corporate roles into their own venture",
        "Hardware and deep-tech teams planning manufacturing and distribution",
        "Amazon teams evaluating startup partnerships",
      ],
      forWho_ar: ["المؤسسون الذين يحضّرون لجولة ما قبل البذرة أو البذرة", "المهنيون المنتقلون من الشركات إلى مشاريعهم الخاصة", "فرق الأجهزة والتقنيات العميقة التي تخطّط للتصنيع والتوزيع", "فرق أمازون التي تقيّم شراكات مع الشركات الناشئة"],
      learn: [
        "How investors actually read a deck and what to fix first",
        "Sequencing markets: where to launch and when to expand",
        "Building a team and board that survive the first three years",
        "Programmes, grants and accelerators worth your time in MENA",
        "Negotiating terms without giving away the company",
      ],
      learn_ar: ["كيف يقرأ المستثمرون عرضك التقديمي وما الذي تصلحه أولاً", "ترتيب الأسواق: أين تطلق ومتى تتوسّع", "بناء فريق ومجلس إدارة يصمدان في السنوات الثلاث الأولى", "البرامج والمنح والمسرّعات التي تستحق وقتك في المنطقة", "التفاوض على الشروط دون التنازل عن الشركة"],
    },
    testimonials: [
      { name: "Sara K.", role: "Founder, climate-tech", date: "12 Aug 2026", quote: "Manav rebuilt our fundraising narrative in thirty minutes. We closed the round six weeks later." },
      { name: "Omar H.", role: "Product lead", date: "3 Jul 2026", quote: "Direct, practical and generous with introductions. Exactly the outside view we needed." },
      { name: "Priya N.", role: "Hardware founder", date: "21 May 2026", quote: "He has seen every mistake a hardware startup can make and told us which ones we were about to make." },
    ],
    faq: [
      { q: "What stage of company do you mentor?", a: "Idea to Series A. Most of my calls are with pre-seed and seed founders, but operators inside larger companies are welcome too." },
      { q: "Should I send a deck before the call?", a: "Yes. Add the link to the booking notes and I will read it beforehand so we can spend the whole call on decisions." },
      { q: "Do you invest in the companies you mentor?", a: "Sometimes, through Brinc, but mentoring here is independent of any investment conversation." },
    ],
    linkedin: "https://www.linkedin.com/in/manavg",
  },
  {
    id: "bashar-aboudaoud",
    dbId: "caf1ee67-267d-591f-9842-5ae649ec2a26",
    name: "Bashar Aboudaoud",
    name_ar: "بشار أبو داود",
    company: "Brinc",
    company_ar: "برينك",
    position: "Co-founder & Chief Investment Officer",
    position_ar: "الشريك المؤسس ورئيس الاستثمار",
    timezone: "Asia/Dubai",
    country: "United Arab Emirates",
    photo_url: "/mentors/bashar.jpg",
    bio: "Bashar co-founded Brinc and leads its investment activity across the MENA region, including UpRound, Brinc's private-markets platform. An entrepreneur since the early 2000s, he built businesses in Hong Kong, Guangzhou and London, co-founded Ecico Group's Hong Kong procurement arm and founded Cicero Capital, a real-estate investment firm. He mentors on investor readiness, deal structure and building a capital strategy that fits the business.",
    bio_ar: "شارك بشار في تأسيس برينك ويقود نشاطها الاستثماري في منطقة الشرق الأوسط وشمال أفريقيا، بما في ذلك منصة UpRound للأسواق الخاصة. رائد أعمال منذ أوائل الألفية، أسّس شركات في هونغ كونغ وغوانزو ولندن، وشارك في تأسيس ذراع المشتريات لمجموعة Ecico وأسّس Cicero Capital. يرشد في جاهزية المستثمرين وهيكلة الصفقات وبناء استراتيجية رأس مال تناسب العمل.",
    expertise: ["Investor readiness", "Deal structuring", "Private markets", "Real estate"],
    expertise_ar: ["جاهزية المستثمرين", "هيكلة الصفقات", "الأسواق الخاصة", "العقارات"],
    industries: ["Venture capital", "Private equity", "Fintech"],
    industries_ar: ["رأس المال المغامر", "الأسهم الخاصة", "التقنية المالية"],
    languages_spoken: ["English", "Arabic"],
    mentorship_preference: "either",
    is_available: true,
    average_rating: "4.8",
    total_ratings: 287,
    created_at: now,
    headline: "Co-founder & CIO, Brinc",
    headline_ar: "الشريك المؤسس ورئيس الاستثمار، برينك",
    chip: "UpRound",
    tint: "orange",
    rating: "4.8/5",
    ratings: 287,
    bookings: "1.2k",
    session: {
      title: "Investor Readiness & Deal Structure",
      title_ar: "الجاهزية للمستثمرين وهيكلة الصفقات",
      subtitle: "Capital strategy call with Bashar",
      subtitle_ar: "مكالمة استراتيجية رأس المال مع بشار",
      minutes: 30,
      intro: "Not sure whether to raise equity, debt or grants, or what terms are normal in the region? Book a one-on-one call with Bashar.",
      intro_ar: "لست متأكداً إن كان عليك جمع أسهم أو ديون أو منح، أو ما الشروط المعتادة في المنطقة؟ احجز مكالمة فردية مع بشار.",
      forWho: [
        "Founders about to open a data room",
        "Angels and family offices making their first startup investments",
        "Operators negotiating a term sheet for the first time",
        "Teams comparing accelerator, syndicate and VC money",
      ],
      forWho_ar: ["المؤسسون على وشك فتح غرفة بيانات", "المستثمرون الملائكيون والمكاتب العائلية في أولى استثماراتهم", "المهنيون الذين يفاوضون على ورقة شروط لأول مرة", "الفرق التي تقارن بين تمويل المسرّعات والتجمعات والمستثمرين"],
      learn: [
        "What a MENA investor checks before the first meeting",
        "Valuation, SAFEs and priced rounds explained without jargon",
        "The clauses that quietly cost founders control",
        "How to run a tight, time-boxed raise",
        "When private-market platforms make sense",
      ],
      learn_ar: ["ما يتحقق منه المستثمر في المنطقة قبل الاجتماع الأول", "التقييم وSAFE والجولات المسعّرة بلا مصطلحات معقدة", "البنود التي تسلب المؤسسين السيطرة بهدوء", "كيف تدير جولة تمويل مضبوطة زمنياً", "متى تكون منصات الأسواق الخاصة منطقية"],
    },
    testimonials: [
      { name: "Lina R.", role: "Fintech founder", date: "28 Aug 2026", quote: "Bashar walked me through our term sheet line by line. We renegotiated two clauses the next morning." },
      { name: "Karim A.", role: "Angel investor", date: "9 Jun 2026", quote: "Calm, precise and honest about risk. I left with a checklist I still use." },
      { name: "Maya T.", role: "COO", date: "2 Apr 2026", quote: "The most useful thirty minutes of our raise." },
    ],
    faq: [
      { q: "Can you review my term sheet on the call?", a: "Yes, if you share it with the booking. I will flag the terms worth negotiating and explain what is standard for the region." },
      { q: "Do you advise on debt as well as equity?", a: "Yes. Many companies should not raise equity at all, and we can work out which instruments fit your cash flows." },
      { q: "Is this an investment pitch?", a: "No. This is mentoring. If an investment conversation makes sense later, it happens separately." },
    ],
    linkedin: "https://ae.linkedin.com/in/bashar-aboudaoud",
  },
  {
    id: "nick-ramil",
    dbId: "20b28010-7bf8-5b6b-a1cc-d9435478d131",
    name: "Nick Ramil",
    name_ar: "نيك راميل",
    company: "Brinc",
    company_ar: "برينك",
    position: "Co-founder & CMO",
    position_ar: "الشريك المؤسس ورئيس التسويق",
    timezone: "Asia/Dubai",
    country: "United Arab Emirates",
    photo_url: "/mentors/nick.png",
    bio: "Nick is part of Brinc's founding team and leads its brand, community and programme marketing from Dubai. He founded Enter China, which helped hundreds of foreign founders manufacture and launch products in Shenzhen, and has invested in and advised early-stage companies for more than a decade. He mentors on positioning, launch marketing, founder storytelling and building an audience before you need it.",
    bio_ar: "نيك من الفريق المؤسس لبرينك ويقود علامتها التجارية ومجتمعها وتسويق برامجها من دبي. أسّس Enter China التي ساعدت مئات المؤسسين الأجانب على التصنيع وإطلاق منتجاتهم في شنجن، وقد استثمر في شركات ناشئة وقدّم لها المشورة لأكثر من عقد. يرشد في التموضع وتسويق الإطلاق وسرد قصة المؤسس وبناء جمهور قبل أن تحتاجه.",
    expertise: ["Positioning", "Launch marketing", "Founder brand", "Community"],
    expertise_ar: ["التموضع", "تسويق الإطلاق", "علامة المؤسس", "بناء المجتمع"],
    industries: ["Marketing", "Consumer", "Hardware"],
    industries_ar: ["التسويق", "المنتجات الاستهلاكية", "الأجهزة"],
    languages_spoken: ["English"],
    mentorship_preference: "either",
    is_available: true,
    average_rating: "4.9",
    total_ratings: 355,
    created_at: now,
    headline: "Co-founder & CMO, Brinc",
    headline_ar: "الشريك المؤسس ورئيس التسويق، برينك",
    chip: "Enter China",
    tint: "purple",
    rating: "4.9/5",
    ratings: 355,
    bookings: "2.4k",
    session: {
      title: "Positioning & Launch Marketing",
      title_ar: "التموضع وتسويق الإطلاق",
      subtitle: "Marketing clinic with Nick",
      subtitle_ar: "عيادة تسويق مع نيك",
      minutes: 30,
      intro: "Launching something and not sure how to talk about it? Book a one-on-one call with Nick.",
      intro_ar: "تطلق شيئاً ولا تعرف كيف تتحدث عنه؟ احجز مكالمة فردية مع نيك.",
      forWho: [
        "Founders preparing a product or programme launch",
        "Marketers moving from execution into strategy",
        "Technical founders who have to become the face of the company",
        "Teams building a community from zero",
      ],
      forWho_ar: ["المؤسسون الذين يحضّرون لإطلاق منتج أو برنامج", "المسوّقون المنتقلون من التنفيذ إلى الاستراتيجية", "المؤسسون التقنيون الذين عليهم أن يصبحوا وجه الشركة", "الفرق التي تبني مجتمعاً من الصفر"],
      learn: [
        "A one-sentence positioning statement you can actually use",
        "Launch sequencing: what to post, where and when",
        "Founder-led content that does not feel forced",
        "Cheap channels that still work in MENA and Asia",
        "Metrics that tell you the story is landing",
      ],
      learn_ar: ["جملة تموضع واحدة يمكنك استخدامها فعلاً", "ترتيب الإطلاق: ماذا تنشر وأين ومتى", "محتوى يقوده المؤسس دون أن يبدو متكلّفاً", "قنوات منخفضة الكلفة لا تزال تعمل في المنطقة وآسيا", "المقاييس التي تخبرك أن القصة تصل"],
    },
    testimonials: [
      { name: "Tanvi P.", role: "Founder", date: "15 Aug 2026", quote: "Very candid and clear. Links to everything shared at the end of the session, which is rare." },
      { name: "Anuja S.", role: "Growth marketer", date: "30 Jun 2026", quote: "Nick helped me see our launch from the audience's side. Helpful as a friend, sharp as an operator." },
      { name: "Daniel W.", role: "Hardware founder", date: "8 May 2026", quote: "He has launched more physical products than anyone I know. Every tip was specific." },
    ],
    faq: [
      { q: "Do I need a marketing budget to benefit from this?", a: "No. Most of what we cover is positioning and founder-led distribution, which costs time rather than money." },
      { q: "Can we review my landing page live?", a: "Yes. Send the link with the booking and we will go through it together." },
      { q: "Do you mentor B2B as well as consumer companies?", a: "Both. The channels differ but the story work is the same." },
    ],
    linkedin: "https://www.linkedin.com/in/nramil",
  },
  {
    id: "levi-lewandowski",
    dbId: "ec758eba-8efc-5c32-a3ee-768badd8c9c9",
    name: "Levi Lewandowski",
    name_ar: "ليفاي ليفاندوفسكي",
    company: "Brinc",
    company_ar: "برينك",
    position: "Head of UAE",
    position_ar: "رئيس الإمارات",
    timezone: "Asia/Dubai",
    country: "United Arab Emirates",
    photo_url: "/mentors/levi.jpg",
    bio: "Levi leads Brinc's UAE operations, running accelerator programmes in Dubai including the Mohammed bin Rashid Innovation Fund accelerator and the VentureVerse founder roadshows. He works daily with government partners, corporates and early-stage teams across the Gulf, and mentors on programme design, corporate-startup collaboration and turning a pilot into a paying customer.",
    bio_ar: "يقود ليفاي عمليات برينك في الإمارات ويدير برامج تسريع في دبي منها مسرّع صندوق محمد بن راشد للابتكار وجولات VentureVerse للمؤسسين. يعمل يومياً مع الشركاء الحكوميين والشركات والفرق الناشئة في الخليج، ويرشد في تصميم البرامج والتعاون بين الشركات والشركات الناشئة وتحويل التجربة إلى عميل يدفع.",
    expertise: ["Accelerator programmes", "Corporate innovation", "Pilots to contracts", "Ecosystem"],
    expertise_ar: ["برامج التسريع", "الابتكار المؤسسي", "من التجارب إلى العقود", "منظومة الأعمال"],
    industries: ["Government", "Smart cities", "Logistics"],
    industries_ar: ["الحكومة", "المدن الذكية", "الخدمات اللوجستية"],
    languages_spoken: ["English"],
    mentorship_preference: "ongoing",
    is_available: true,
    average_rating: "4.8",
    total_ratings: 198,
    created_at: now,
    headline: "Head of UAE, Brinc",
    headline_ar: "رئيس الإمارات، برينك",
    chip: "MBRIF",
    tint: "orange",
    rating: "4.8/5",
    ratings: 198,
    bookings: "940",
    session: {
      title: "Corporate & Government Partnerships in the UAE",
      title_ar: "الشراكات مع الشركات والجهات الحكومية في الإمارات",
      subtitle: "Partnership clinic with Levi",
      subtitle_ar: "عيادة الشراكات مع ليفاي",
      minutes: 30,
      intro: "Trying to land a pilot with a corporate or a government entity in the Gulf? Book a one-on-one call with Levi.",
      intro_ar: "تحاول الحصول على تجربة مع شركة أو جهة حكومية في الخليج؟ احجز مكالمة فردية مع ليفاي.",
      forWho: [
        "Founders selling into corporates and government for the first time",
        "Innovation managers who want pilots to convert",
        "Teams relocating or expanding to the UAE",
        "Programme managers designing an accelerator or cohort",
      ],
      forWho_ar: ["المؤسسون الذين يبيعون للشركات والحكومة لأول مرة", "مديرو الابتكار الذين يريدون أن تتحوّل التجارب إلى عقود", "الفرق التي تنتقل أو تتوسّع إلى الإمارات", "مديرو البرامج الذين يصمّمون مسرّعاً أو دفعة"],
      learn: [
        "How procurement really works in UAE entities",
        "Scoping a pilot so it can become a contract",
        "Which programmes, free zones and funds fit your stage",
        "Building a partner map for the Gulf",
        "Running a cohort that founders actually finish",
      ],
      learn_ar: ["كيف تعمل المشتريات فعلاً في الجهات الإماراتية", "تحديد نطاق التجربة بحيث تتحوّل إلى عقد", "أي البرامج والمناطق الحرة والصناديق تناسب مرحلتك", "بناء خريطة شركاء للخليج", "إدارة دفعة يُكملها المؤسسون فعلاً"],
    },
    testimonials: [
      { name: "Hassan M.", role: "Logistics founder", date: "20 Aug 2026", quote: "Levi told us exactly which department to talk to and how to frame the pilot. Signed two months later." },
      { name: "Rania F.", role: "Innovation manager", date: "11 Jul 2026", quote: "Finally someone who has run programmes on both sides of the table." },
      { name: "Jonas E.", role: "Founder", date: "5 Mar 2026", quote: "Clear, kind and unbelievably well connected." },
    ],
    faq: [
      { q: "Can you introduce me to a government partner?", a: "The call is about preparing you for those conversations. Introductions happen when there is a real fit, never as the goal of a session." },
      { q: "Do you help companies that are not in the UAE yet?", a: "Yes. Many calls are with teams deciding whether and how to enter the market." },
      { q: "What should I prepare?", a: "A one-paragraph description of what you sell and who you think the buyer is. We will refine both." },
    ],
    linkedin: "https://ae.linkedin.com/in/levilewandowski",
  },
  {
    id: "ghita-elidrissi",
    dbId: "6afa7b6d-d098-568a-b629-2b04c6edeef1",
    name: "Ghita Elidrissi",
    name_ar: "غيثة الإدريسي",
    company: "UpRound by Brinc",
    company_ar: "UpRound من برينك",
    position: "Venture Operator",
    position_ar: "مشغّلة استثمارات",
    timezone: "Asia/Dubai",
    country: "United Arab Emirates",
    photo_url: "/mentors/ghita.jpg",
    bio: "Ghita is a Venture Operator at UpRound by Brinc, where she runs syndicate deals that open venture investing to a wider set of backers. She previously managed portfolio and programmes at Brinc and worked at Hartree Partners and MAGNiTT, the MENA startup-data platform. She holds a degree in Global Affairs with a focus on the MENA region from George Mason University, and mentors on portfolio strategy, founder-investor communication and navigating the region's funding landscape.",
    bio_ar: "غيثة مشغّلة استثمارات في UpRound من برينك، حيث تدير صفقات تجميعية تفتح الاستثمار المغامر لشريحة أوسع من الداعمين. عملت سابقاً في إدارة المحفظة والبرامج في برينك، وفي Hartree Partners وMAGNiTT منصة بيانات الشركات الناشئة في المنطقة. تحمل شهادة في الشؤون العالمية بتركيز على المنطقة من جامعة جورج ميسون، وترشد في استراتيجية المحفظة وتواصل المؤسسين مع المستثمرين والتعامل مع مشهد التمويل في المنطقة.",
    expertise: ["Portfolio strategy", "Investor updates", "Syndicates", "Market research"],
    expertise_ar: ["استراتيجية المحفظة", "تحديثات المستثمرين", "التجمعات الاستثمارية", "أبحاث السوق"],
    industries: ["Venture capital", "Startup data", "Energy"],
    industries_ar: ["رأس المال المغامر", "بيانات الشركات الناشئة", "الطاقة"],
    languages_spoken: ["English", "Arabic", "French"],
    mentorship_preference: "either",
    is_available: true,
    average_rating: "5.0",
    total_ratings: 143,
    created_at: now,
    headline: "Venture Operator, UpRound by Brinc",
    headline_ar: "مشغّلة استثمارات، UpRound من برينك",
    chip: "UpRound",
    tint: "green",
    rating: "5.0/5",
    ratings: 143,
    bookings: "620",
    session: {
      title: "Navigating MENA Venture Funding",
      title_ar: "التعامل مع تمويل المشاريع في المنطقة",
      subtitle: "Funding landscape call with Ghita",
      subtitle_ar: "مكالمة عن مشهد التمويل مع غيثة",
      minutes: 30,
      intro: "Want to understand who funds what in the region and how to reach them? Book a one-on-one call with Ghita.",
      intro_ar: "تريد أن تفهم من يموّل ماذا في المنطقة وكيف تصل إليهم؟ احجز مكالمة فردية مع غيثة.",
      forWho: [
        "First-time founders mapping investors in MENA",
        "Founders writing their first investor update",
        "Early-career professionals moving into venture",
        "Angels joining or starting a syndicate",
      ],
      forWho_ar: ["المؤسسون الجدد الذين يرسمون خريطة المستثمرين في المنطقة", "المؤسسون الذين يكتبون أول تحديث للمستثمرين", "المهنيون في بداية مسيرتهم المنتقلون إلى الاستثمار المغامر", "المستثمرون الملائكيون الذين ينضمون إلى تجمع أو يؤسسونه"],
      learn: [
        "How the MENA funding map really looks in 2026",
        "Writing investor updates people reply to",
        "Using data platforms to find the right fund, not the biggest",
        "How syndicates work from the inside",
        "Breaking into venture without a finance background",
      ],
      learn_ar: ["كيف تبدو خريطة التمويل في المنطقة فعلاً عام 2026", "كتابة تحديثات للمستثمرين يردّ عليها الناس", "استخدام منصات البيانات لإيجاد الصندوق المناسب لا الأكبر", "كيف تعمل التجمعات الاستثمارية من الداخل", "دخول عالم الاستثمار المغامر بلا خلفية مالية"],
    },
    testimonials: [
      { name: "Aisha B.", role: "Founder", date: "25 Aug 2026", quote: "Ghita gave me a list of twelve funds that actually invest at my stage and sector. Three replied within a week." },
      { name: "Yusuf D.", role: "Analyst", date: "14 Jun 2026", quote: "Warm, structured and honest about the path into venture. Exactly what I needed." },
      { name: "Elena V.", role: "Angel", date: "19 Apr 2026", quote: "She explained syndicates better than any deck I have read." },
    ],
    faq: [
      { q: "Will you review my investor update?", a: "Yes. Share the draft with the booking and we will rewrite it together on the call." },
      { q: "Do you cover funds outside the Gulf?", a: "The focus is MENA, but many of the funds active here are regional or global, so the map extends naturally." },
      { q: "I want to work in venture. Is this call for me?", a: "Yes. Around a third of my sessions are with people moving into the industry." },
    ],
    linkedin: "https://www.linkedin.com/in/ghitaelidrissi",
  },
];

/** Lookup by slug/id; returns undefined for anything that is not a curated mentor. */
export function featuredMentor(id: string | undefined): FeaturedMentor | undefined {
  return FEATURED_MENTORS.find((m) => m.id === id);
}

/** Database ids of the curated five (design §3.1). */
export const FEATURED_DB_IDS: ReadonlySet<string> = new Set(FEATURED_MENTORS.map((m) => m.dbId));

/** True when the id is one of the curated five's database ids. */
export function isFeaturedDbId(id: string | null | undefined): boolean {
  return !!id && FEATURED_DB_IDS.has(id);
}

/** Curated mentor by slug or by database id; undefined otherwise. */
export function featuredMentorByAnyId(id: string | null | undefined): FeaturedMentor | undefined {
  if (!id) return undefined;
  return FEATURED_MENTORS.find((m) => m.id === id || m.dbId === id);
}

const TINTS: FeaturedMentor["tint"][] = ["green", "orange", "purple"];

/**
 * A mentor who signed up through the onboarding form, shaped like a curated
 * one so the same profile / session pages render them: the headline, chip
 * and session offer are derived from what they entered; testimonials and
 * FAQ start empty and simply do not render.
 */
export function toShowcaseMentor(m: Mentor): FeaturedMentor {
  const firstName = m.name.split(" ")[0] || m.name;
  const headline = [m.position, m.company].filter(Boolean).join(", ") || m.name;
  const headlineAr = [m.position_ar ?? m.position, m.company_ar ?? m.company].filter(Boolean).join("، ") || m.name_ar || m.name;
  const focus = m.expertise.slice(0, 2).join(" & ") || "Mentoring";
  const focusAr = (m.expertise_ar ?? m.expertise).slice(0, 2).join(" و") || "الإرشاد";
  const firstSentence = (m.bio.split(/[.!?]\s+/)[0] ?? m.bio).trim();
  let h = 0;
  for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) >>> 0;
  return {
    ...m,
    dbId: m.id,
    headline,
    headline_ar: headlineAr,
    chip: m.company || m.country || "Mentor",
    tint: TINTS[h % TINTS.length],
    rating: m.average_rating ? `${m.average_rating}/5` : "New",
    ratings: m.total_ratings ?? 0,
    bookings: "0",
    session: {
      title: focus,
      title_ar: focusAr,
      subtitle: `1:1 session with ${firstName}`,
      subtitle_ar: `جلسة فردية مع ${m.name_ar ?? firstName}`,
      minutes: 30,
      intro: firstSentence,
      intro_ar: (m.bio_ar ?? firstSentence).split(/[.!؟]\s+/)[0] ?? firstSentence,
      forWho: m.industries.map((i) => `People working in ${i}`),
      forWho_ar: (m.industries_ar ?? m.industries).map((i) => `العاملون في ${i}`),
      learn: m.expertise,
      learn_ar: m.expertise_ar ?? m.expertise,
    },
    testimonials: [],
    faq: [],
    linkedin: m.linkedin_url ?? "",
    cal_link: m.cal_link,
  };
}

/** Curated mentor, or a mentor saved locally through onboarding, by id. */
export function resolveShowcaseMentor(id: string | undefined): FeaturedMentor | undefined {
  if (!id) return undefined;
  const curated = featuredMentor(id);
  if (curated) return curated;
  const local = localStore.find("mentors", id);
  return local ? toShowcaseMentor(local) : undefined;
}
