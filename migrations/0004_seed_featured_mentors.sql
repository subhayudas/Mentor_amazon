-- =============================================================================
-- 0004_seed_featured_mentors — OPTIONAL: the five featured mentors as real mentors rows
-- =============================================================================
-- Run ONLY after the programme has confirmed that these five people agree to receive
-- mentorship requests through MentorConnect (consent; design risk R4). Until then the
-- directory shows them from the static landing data as "opening soon" and not bookable.
--
-- Each row is programme-managed: a placeholder e-mail under the reserved .invalid domain
-- (RFC 6761; nothing can be sent there and nobody can sign in as it), no Cal.com link,
-- ratings 0. Requests to them notify every admin, who answers them in /admin/bookings.
-- Ids are UUIDv5 (URL namespace) of https://mentor-amazon.vercel.app/mentor/<slug>; they match
-- client/src/data/featuredMentors.ts (dbId), and tests/featured-ids.test.ts checks both.
-- Values are copied verbatim from featuredMentors.ts.
--
-- Prerequisite: migrations/0002_production_readiness.sql. Safe any time after it, idempotent:
-- ON CONFLICT (id) DO NOTHING, so a re-run never overwrites an admin's later edits
-- (for example is_available = false). One transaction.
--
-- To hand a profile to the real person later (with their consent), update that row's email
-- to their sign-in address, set managed_by_programme = false and let them add a Cal.com link.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mc_settings') IS NULL OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mentors' AND column_name = 'managed_by_programme') THEN
    RAISE EXCEPTION '0004 preconditions failed: run migrations/0002_production_readiness.sql first';
  END IF;
  -- Self-check of the id literals below whenever uuid-ossp is installed (Supabase default).
  IF to_regprocedure('extensions.uuid_generate_v5(uuid,text)') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM (VALUES
        ('manav-gupta',      '738d7465-42c6-5550-be9a-6e7ef35f52bc'),
        ('bashar-aboudaoud', 'caf1ee67-267d-591f-9842-5ae649ec2a26'),
        ('nick-ramil',       '20b28010-7bf8-5b6b-a1cc-d9435478d131'),
        ('levi-lewandowski', 'ec758eba-8efc-5c32-a3ee-768badd8c9c9'),
        ('ghita-elidrissi',  '6afa7b6d-d098-568a-b629-2b04c6edeef1')
      ) AS f (slug, id)
      WHERE extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'https://mentor-amazon.vercel.app/mentor/' || f.slug)::text <> f.id
    ) THEN
      RAISE EXCEPTION '0004: a featured mentor id does not match its UUIDv5';
    END IF;
  END IF;
END $$;

INSERT INTO public.mentors (
  id, name, name_ar, email, company, company_ar, position, position_ar, timezone, country, photo_url,
  bio, bio_ar, linkedin_url, cal_link, expertise, expertise_ar, industries, industries_ar, languages_spoken,
  comms_owner, mentorship_preference, is_available, average_rating, total_ratings, managed_by_programme,
  created_at, updated_at)
VALUES
  -- manav-gupta
  ('738d7465-42c6-5550-be9a-6e7ef35f52bc',
   'Manav Gupta',
   'ماناف غوبتا',
   'featured.manav-gupta@mentorconnect.invalid',
   'Brinc',
   'برينك',
   'Founder & CEO',
   'المؤسس والرئيس التنفيذي',
   'Asia/Dubai',
   'United Arab Emirates',
   '/mentors/manav.jpg',
   'Manav founded Brinc in 2014 and has grown it into a global venture accelerator with offices across Hong Kong, Dubai, Bahrain and India that has backed more than 200 startups in climate tech, food tech, Web3 and IoT. Before Brinc he was Managing Director at FabriQate, building interactive products for multinational clients across Asia. He studied at Purdue University and The Hong Kong Polytechnic University, and mentors founders on fundraising, go-to-market and building companies across borders.',
   'أسّس ماناف شركة برينك عام 2014 وحوّلها إلى مسرّع أعمال عالمي بمكاتب في هونغ كونغ ودبي والبحرين والهند، دعم أكثر من 200 شركة ناشئة في تقنيات المناخ والغذاء وويب3 وإنترنت الأشياء. قبل ذلك كان مديراً تنفيذياً في FabriQate. درس في جامعة بيردو وجامعة هونغ كونغ للفنون التطبيقية، ويرشد المؤسسين في جمع التمويل والدخول إلى الأسواق وبناء الشركات عبر الحدود.',
   'https://www.linkedin.com/in/manavg',
   '',
   ARRAY['Fundraising', 'Go-to-market', 'Company building', 'Hardware & IoT'],
   ARRAY['جمع التمويل', 'الدخول إلى السوق', 'بناء الشركات', 'الأجهزة وإنترنت الأشياء'],
   ARRAY['Venture capital', 'Climate tech', 'Web3'],
   ARRAY['رأس المال المغامر', 'تقنيات المناخ', 'ويب3'],
   ARRAY['English', 'Hindi'],
   'exec',
   'either',
   true,
   0,
   0,
   true,
   timezone('utc', now()),
   timezone('utc', now())),
  -- bashar-aboudaoud
  ('caf1ee67-267d-591f-9842-5ae649ec2a26',
   'Bashar Aboudaoud',
   'بشار أبو داود',
   'featured.bashar-aboudaoud@mentorconnect.invalid',
   'Brinc',
   'برينك',
   'Co-founder & Chief Investment Officer',
   'الشريك المؤسس ورئيس الاستثمار',
   'Asia/Dubai',
   'United Arab Emirates',
   '/mentors/bashar.jpg',
   'Bashar co-founded Brinc and leads its investment activity across the MENA region, including UpRound, Brinc''s private-markets platform. An entrepreneur since the early 2000s, he built businesses in Hong Kong, Guangzhou and London, co-founded Ecico Group''s Hong Kong procurement arm and founded Cicero Capital, a real-estate investment firm. He mentors on investor readiness, deal structure and building a capital strategy that fits the business.',
   'شارك بشار في تأسيس برينك ويقود نشاطها الاستثماري في منطقة الشرق الأوسط وشمال أفريقيا، بما في ذلك منصة UpRound للأسواق الخاصة. رائد أعمال منذ أوائل الألفية، أسّس شركات في هونغ كونغ وغوانزو ولندن، وشارك في تأسيس ذراع المشتريات لمجموعة Ecico وأسّس Cicero Capital. يرشد في جاهزية المستثمرين وهيكلة الصفقات وبناء استراتيجية رأس مال تناسب العمل.',
   'https://ae.linkedin.com/in/bashar-aboudaoud',
   '',
   ARRAY['Investor readiness', 'Deal structuring', 'Private markets', 'Real estate'],
   ARRAY['جاهزية المستثمرين', 'هيكلة الصفقات', 'الأسواق الخاصة', 'العقارات'],
   ARRAY['Venture capital', 'Private equity', 'Fintech'],
   ARRAY['رأس المال المغامر', 'الأسهم الخاصة', 'التقنية المالية'],
   ARRAY['English', 'Arabic'],
   'exec',
   'either',
   true,
   0,
   0,
   true,
   timezone('utc', now()),
   timezone('utc', now())),
  -- nick-ramil
  ('20b28010-7bf8-5b6b-a1cc-d9435478d131',
   'Nick Ramil',
   'نيك راميل',
   'featured.nick-ramil@mentorconnect.invalid',
   'Brinc',
   'برينك',
   'Co-founder & CMO',
   'الشريك المؤسس ورئيس التسويق',
   'Asia/Dubai',
   'United Arab Emirates',
   '/mentors/nick.png',
   'Nick is part of Brinc''s founding team and leads its brand, community and programme marketing from Dubai. He founded Enter China, which helped hundreds of foreign founders manufacture and launch products in Shenzhen, and has invested in and advised early-stage companies for more than a decade. He mentors on positioning, launch marketing, founder storytelling and building an audience before you need it.',
   'نيك من الفريق المؤسس لبرينك ويقود علامتها التجارية ومجتمعها وتسويق برامجها من دبي. أسّس Enter China التي ساعدت مئات المؤسسين الأجانب على التصنيع وإطلاق منتجاتهم في شنجن، وقد استثمر في شركات ناشئة وقدّم لها المشورة لأكثر من عقد. يرشد في التموضع وتسويق الإطلاق وسرد قصة المؤسس وبناء جمهور قبل أن تحتاجه.',
   'https://www.linkedin.com/in/nramil',
   '',
   ARRAY['Positioning', 'Launch marketing', 'Founder brand', 'Community'],
   ARRAY['التموضع', 'تسويق الإطلاق', 'علامة المؤسس', 'بناء المجتمع'],
   ARRAY['Marketing', 'Consumer', 'Hardware'],
   ARRAY['التسويق', 'المنتجات الاستهلاكية', 'الأجهزة'],
   ARRAY['English'],
   'exec',
   'either',
   true,
   0,
   0,
   true,
   timezone('utc', now()),
   timezone('utc', now())),
  -- levi-lewandowski
  ('ec758eba-8efc-5c32-a3ee-768badd8c9c9',
   'Levi Lewandowski',
   'ليفاي ليفاندوفسكي',
   'featured.levi-lewandowski@mentorconnect.invalid',
   'Brinc',
   'برينك',
   'Head of UAE',
   'رئيس الإمارات',
   'Asia/Dubai',
   'United Arab Emirates',
   '/mentors/levi.jpg',
   'Levi leads Brinc''s UAE operations, running accelerator programmes in Dubai including the Mohammed bin Rashid Innovation Fund accelerator and the VentureVerse founder roadshows. He works daily with government partners, corporates and early-stage teams across the Gulf, and mentors on programme design, corporate-startup collaboration and turning a pilot into a paying customer.',
   'يقود ليفاي عمليات برينك في الإمارات ويدير برامج تسريع في دبي منها مسرّع صندوق محمد بن راشد للابتكار وجولات VentureVerse للمؤسسين. يعمل يومياً مع الشركاء الحكوميين والشركات والفرق الناشئة في الخليج، ويرشد في تصميم البرامج والتعاون بين الشركات والشركات الناشئة وتحويل التجربة إلى عميل يدفع.',
   'https://ae.linkedin.com/in/levilewandowski',
   '',
   ARRAY['Accelerator programmes', 'Corporate innovation', 'Pilots to contracts', 'Ecosystem'],
   ARRAY['برامج التسريع', 'الابتكار المؤسسي', 'من التجارب إلى العقود', 'منظومة الأعمال'],
   ARRAY['Government', 'Smart cities', 'Logistics'],
   ARRAY['الحكومة', 'المدن الذكية', 'الخدمات اللوجستية'],
   ARRAY['English'],
   'exec',
   'ongoing',
   true,
   0,
   0,
   true,
   timezone('utc', now()),
   timezone('utc', now())),
  -- ghita-elidrissi
  ('6afa7b6d-d098-568a-b629-2b04c6edeef1',
   'Ghita Elidrissi',
   'غيثة الإدريسي',
   'featured.ghita-elidrissi@mentorconnect.invalid',
   'UpRound by Brinc',
   'UpRound من برينك',
   'Venture Operator',
   'مشغّلة استثمارات',
   'Asia/Dubai',
   'United Arab Emirates',
   '/mentors/ghita.jpg',
   'Ghita is a Venture Operator at UpRound by Brinc, where she runs syndicate deals that open venture investing to a wider set of backers. She previously managed portfolio and programmes at Brinc and worked at Hartree Partners and MAGNiTT, the MENA startup-data platform. She holds a degree in Global Affairs with a focus on the MENA region from George Mason University, and mentors on portfolio strategy, founder-investor communication and navigating the region''s funding landscape.',
   'غيثة مشغّلة استثمارات في UpRound من برينك، حيث تدير صفقات تجميعية تفتح الاستثمار المغامر لشريحة أوسع من الداعمين. عملت سابقاً في إدارة المحفظة والبرامج في برينك، وفي Hartree Partners وMAGNiTT منصة بيانات الشركات الناشئة في المنطقة. تحمل شهادة في الشؤون العالمية بتركيز على المنطقة من جامعة جورج ميسون، وترشد في استراتيجية المحفظة وتواصل المؤسسين مع المستثمرين والتعامل مع مشهد التمويل في المنطقة.',
   'https://www.linkedin.com/in/ghitaelidrissi',
   '',
   ARRAY['Portfolio strategy', 'Investor updates', 'Syndicates', 'Market research'],
   ARRAY['استراتيجية المحفظة', 'تحديثات المستثمرين', 'التجمعات الاستثمارية', 'أبحاث السوق'],
   ARRAY['Venture capital', 'Startup data', 'Energy'],
   ARRAY['رأس المال المغامر', 'بيانات الشركات الناشئة', 'الطاقة'],
   ARRAY['English', 'Arabic', 'French'],
   'exec',
   'either',
   true,
   0,
   0,
   true,
   timezone('utc', now()),
   timezone('utc', now()))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schema_migrations (version, note)
VALUES ('0004_seed_featured_mentors', 'the five featured mentors as programme-managed rows')
ON CONFLICT (version) DO UPDATE SET applied_at = now();

DO $$
BEGIN
  RAISE NOTICE '0004 applied: % programme-managed mentors present',
    (SELECT count(*) FROM public.mentors WHERE managed_by_programme);
END $$;

COMMIT;

-- Verification (expect 5 rows, placeholder emails, ratings 0.00, managed_by_programme true):
-- select id, name, email, cal_link, average_rating, total_ratings, managed_by_programme, is_available
--   from public.mentors where email like 'featured.%@mentorconnect.invalid' order by name;
-- To stop requests to one of them without deleting anything:
-- update public.mentors set is_available = false where id = '<uuid>';
