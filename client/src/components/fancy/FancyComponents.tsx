"use client";

import { useRef, useEffect, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimatedGradientProps {
    colors: string[];
    speed?: number;
    blur?: "light" | "medium" | "heavy";
    className?: string;
}

function AnimatedGradient({
    colors,
    speed = 5,
    blur = "medium",
    className,
}: AnimatedGradientProps) {
    const blurMap = {
        light: "blur-2xl",
        medium: "blur-3xl",
        heavy: "blur-[100px]",
    };

    return (
        <div className={cn("absolute inset-0 overflow-hidden", className)}>
            <svg
                className="absolute inset-0 w-full h-full"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <filter id="goo">
                        <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
                        <feColorMatrix
                            in="blur"
                            mode="matrix"
                            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
                            result="goo"
                        />
                    </filter>
                </defs>
            </svg>
            {colors.map((color, index) => (
                <div
                    key={index}
                    className={cn(
                        "absolute rounded-full",
                        blurMap[blur],
                        "animate-float-gradient"
                    )}
                    style={{
                        backgroundColor: color,
                        width: `${30 + Math.random() * 20}%`,
                        height: `${30 + Math.random() * 20}%`,
                        left: `${(index * 100) / colors.length}%`,
                        top: `${20 + (index % 2) * 30}%`,
                        animationDuration: `${speed + index * 2}s`,
                        animationDelay: `${index * 0.5}s`,
                        opacity: 0.7,
                    }}
                />
            ))}
            <style>{`
        @keyframes float-gradient {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(10%, -10%) scale(1.1);
          }
          50% {
            transform: translate(-5%, 15%) scale(0.95);
          }
          75% {
            transform: translate(-10%, -5%) scale(1.05);
          }
        }
        .animate-float-gradient {
          animation: float-gradient 10s ease-in-out infinite;
        }
      `}</style>
        </div>
    );
}

interface NumberTickerProps {
    from?: number;
    target: number;
    duration?: number;
    className?: string;
    suffix?: string;
}

function NumberTicker({
    from = 0,
    target,
    duration = 2,
    className,
    suffix = "",
}: NumberTickerProps) {
    const ref = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        let startTime: number | null = null;
        let animationId: number;

        const animate = (currentTime: number) => {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / (duration * 1000), 1);

            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(from + (target - from) * easeOut);

            element.textContent = current.toString() + suffix;

            if (progress < 1) {
                animationId = requestAnimationFrame(animate);
            }
        };

        // Start animation when element is in view
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    animationId = requestAnimationFrame(animate);
                    observer.disconnect();
                }
            },
            { threshold: 0.5 }
        );

        observer.observe(element);

        return () => {
            if (animationId) cancelAnimationFrame(animationId);
            observer.disconnect();
        };
    }, [from, target, duration, suffix]);

    return (
        <span ref={ref} className={cn("tabular-nums", className)}>
            {from}
            {suffix}
        </span>
    );
}

interface LetterSwapProps {
    label: string;
    className?: string;
    reverse?: boolean;
    staggerFrom?: "first" | "center" | "last";
}

function LetterSwapForward({
    label,
    className,
    reverse = false,
    staggerFrom = "first",
}: LetterSwapProps) {
    const letters = label.split("");

    const getDelay = (index: number) => {
        const total = letters.length;
        switch (staggerFrom) {
            case "center":
                return Math.abs(index - total / 2) * 30;
            case "last":
                return (total - index) * 30;
            default:
                return index * 30;
        }
    };

    return (
        <span className={cn("inline-flex overflow-hidden", className)}>
            {letters.map((letter, index) => (
                <span
                    key={index}
                    className="relative inline-block group-hover:animate-letter-swap"
                    style={{
                        animationDelay: `${getDelay(index)}ms`,
                    }}
                >
                    <span className="inline-block transition-transform duration-300 group-hover:-translate-y-full">
                        {letter === " " ? "\u00A0" : letter}
                    </span>
                    <span
                        className="absolute left-0 top-full inline-block transition-transform duration-300 group-hover:-translate-y-full"
                        aria-hidden
                    >
                        {letter === " " ? "\u00A0" : letter}
                    </span>
                </span>
            ))}
        </span>
    );
}

interface ScrambleTextProps {
    children: ReactNode;
    className?: string;
    scrambleSpeed?: number;
}

function ScrambleHover({
    children,
    className,
    scrambleSpeed = 50,
}: ScrambleTextProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const originalText = useRef<string>("");
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    const scramble = () => {
        const element = ref.current;
        if (!element || !originalText.current) return;

        let iteration = 0;
        const target = originalText.current;

        const interval = setInterval(() => {
            element.textContent = target
                .split("")
                .map((char, index) => {
                    if (index < iteration) return target[index];
                    if (char === " ") return " ";
                    return chars[Math.floor(Math.random() * chars.length)];
                })
                .join("");

            if (iteration >= target.length) {
                clearInterval(interval);
            }
            iteration += 1 / 3;
        }, scrambleSpeed);
    };

    useEffect(() => {
        if (ref.current) {
            originalText.current = ref.current.textContent || "";
        }
    }, [children]);

    return (
        <span
            ref={ref}
            className={cn("inline-block cursor-pointer", className)}
            onMouseEnter={scramble}
        >
            {children}
        </span>
    );
}

export { AnimatedGradient, NumberTicker, LetterSwapForward, ScrambleHover };
