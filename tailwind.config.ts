import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Design tokens live in client/src/index.css as CSS custom properties; this
 * config only maps them to utility classes. Every colour keeps the shadcn
 * `hsl(var(--x) / <alpha-value>)` contract so opacity modifiers keep working.
 */
export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 4px)",
      },
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          soft: "hsl(var(--destructive-soft) / <alpha-value>)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
          soft: "hsl(var(--success-soft) / <alpha-value>)",
          "soft-foreground": "hsl(var(--success-soft-foreground) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
          border: "hsl(var(--warning-border) / <alpha-value>)",
          icon: "hsl(var(--warning-icon) / <alpha-value>)",
        },
        info: {
          DEFAULT: "hsl(var(--info) / <alpha-value>)",
          foreground: "hsl(var(--info-foreground) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
        },
        brand: {
          navy: "var(--brand-navy)",
          "navy-700": "var(--brand-navy-700)",
          orange: "var(--brand-orange)",
          "orange-600": "var(--brand-orange-600)",
          "orange-700": "var(--brand-orange-700)",
          "orange-50": "var(--brand-orange-50)",
          "orange-100": "var(--brand-orange-100)",
        },
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans Arabic", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      // Type roles (spec §1 as amended by P1-3). Desktop value first; the `-sm`
      // twins are the mobile steps. Headings get `text-wrap: balance` in index.css.
      // Arabic compensation (P1-4) flows through the CSS variables so responsive
      // variants (md:text-h1) stay correct: html[lang="ar"] sets --type-bump: 1px,
      // --heading-weight: 500 and taller leading.
      fontSize: {
        display: ["calc(3.25rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-display, 1.05)", letterSpacing: "-0.02em", fontWeight: "var(--heading-weight, 600)" }],
        "display-sm": ["calc(2.25rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-display, 1.1)", letterSpacing: "-0.02em", fontWeight: "var(--heading-weight, 600)" }],
        h1: ["calc(1.875rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-heading, 1.2)", letterSpacing: "-0.01em", fontWeight: "var(--heading-weight, 600)" }],
        "h1-sm": ["calc(1.625rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-heading, 1.2)", letterSpacing: "-0.01em", fontWeight: "var(--heading-weight, 600)" }],
        h2: ["calc(1.5rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-heading, 1.25)", letterSpacing: "-0.01em", fontWeight: "var(--heading-weight, 600)" }],
        "h2-sm": ["calc(1.25rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-heading, 1.3)", letterSpacing: "-0.01em", fontWeight: "var(--heading-weight, 600)" }],
        h3: ["calc(1.125rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-heading, 1.4)", fontWeight: "var(--heading-weight, 600)" }],
        body: ["calc(1rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-body, 1.55)" }],
        "body-sm": ["calc(0.875rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-body-sm, 1.5)" }],
        caption: ["calc(0.75rem + var(--type-bump, 0px))", { lineHeight: "var(--lh-caption, 1.4)", fontWeight: "500" }],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        elevated: "var(--shadow-elevated)",
      },
      // Named steps only: an arbitrary `duration-[140ms]` is ambiguous between
      // the core plugin and tailwindcss-animate and is silently dropped.
      transitionDuration: {
        fast: "120ms",
        base: "160ms",
        slow: "220ms",
        "140": "140ms",
        "180": "180ms",
      },
      // Overrides Tailwind's weak `ease-out`/`ease-in-out` on purpose: every
      // transition and every tailwindcss-animate keyframe then shares the
      // spec curves (the plugin spreads these into animationTimingFunction).
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
        drawer: "var(--ease-drawer)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // Sheet travel is driven by --sheet-x/--sheet-y set per logical side,
        // so no physical slide-in-from-* utility is needed.
        // Opacity rides along so a reduced-motion open (travel zeroed) is a
        // short fade rather than a pop.
        "sheet-in": {
          from: { transform: "translate(var(--sheet-x, 0), var(--sheet-y, 0))", opacity: "0" },
          to: { transform: "translate(0, 0)", opacity: "1" },
        },
        "sheet-out": {
          from: { transform: "translate(0, 0)", opacity: "1" },
          to: { transform: "translate(var(--sheet-x, 0), var(--sheet-y, 0))", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 200ms var(--ease-out)",
        "accordion-up": "accordion-up 200ms var(--ease-out)",
        "sheet-in": "sheet-in 240ms var(--ease-drawer)",
        "sheet-out": "sheet-out 200ms var(--ease-drawer)",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
    // `coarse:` = touch pointers, used to grow hit areas to 44px without
    // changing the desktop geometry.
    plugin(({ addVariant }) => {
      addVariant("coarse", "@media (pointer: coarse)");
    }),
  ],
} satisfies Config;
