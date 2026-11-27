"use client";
import Image from "next/image";
import Link from "next/link";
import { type FormEvent, useState } from "react";

export function SiteFooter() {
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [pending, setPending] = useState(false);

  async function handleSubscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setPending(true);
    setStatus("idle");
    try {
      const response = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: values.get("email"),
          emailConsent: values.get("consent") === "on",
          sourcePage: window.location.pathname,
          referrer: document.referrer,
          website: values.get("website"),
        }),
      });
      if (!response.ok) throw new Error("Subscription failed");
      form.reset();
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setPending(false);
    }
  }

  return (
    <footer className="newsletter" id="newsletter">
      <div className="container newsletter-inner">
        <div className="newsletter-top">
          <div>
            <span className="eyebrow" style={{ color: "var(--inverse-copy)" }}>
              The next perspective
            </span>
            <h2 className="editorial">Good stories. In good company.</h2>
            <p className="newsletter-copy">
              New editions, thoughtful interviews and ideas worth your time. In
              your inbox.
            </p>
          </div>
          <form className="newsletter-form" onSubmit={handleSubscribe}>
            <label className="newsletter-label" htmlFor="newsletter-email">
              Your email address
            </label>
            <input
              className="newsletter-input"
              id="newsletter-email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              maxLength={254}
            />
            <label className="newsletter-consent">
              <input type="checkbox" name="consent" required /> I agree to
              receive magazine updates by email.
            </label>
            <input
              className="newsletter-honeypot"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <button
              className="newsletter-submit"
              type="submit"
              disabled={pending}
            >
              {pending ? "Subscribing…" : "Subscribe"}{" "}
              <span aria-hidden="true">→</span>
            </button>
            {status === "success" ? (
              <p className="newsletter-legal" role="status">
                You’re subscribed. You can unsubscribe anytime.
              </p>
            ) : status === "error" ? (
              <p className="newsletter-error" role="alert">
                We couldn’t save your subscription. Please try again.
              </p>
            ) : (
              <p className="newsletter-legal">
                Magazine updates only. Unsubscribe anytime.
              </p>
            )}
          </form>
        </div>
        <div className="footer-bottom">
          {/* Footer Logo + Navigation */}
          <div className="flex w-full flex-row items-center justify-between gap-3">
            {/* Logo */}
            <Link
              href="/"
              aria-label="The Visionary Voice home"
              className="flex shrink-0 items-center"
            >
              <Image
                src="/tvv-logo.png"
                alt="The Visionary Voice"
                width={180}
                height={60}
                priority
                className="h-9 w-auto max-w-[140px] object-contain sm:h-10 sm:max-w-[160px] md:h-11 md:max-w-[180px] lg:h-12 lg:max-w-[200px]"
              />
            </Link>

            {/* Navigation Links */}
            <nav className="flex flex-1 items-center justify-end gap-3 whitespace-nowrap sm:gap-5 md:gap-7">
              <Link
                href="/"
                className="text-[11px] sm:text-sm hover:opacity-70"
              >
                Home
              </Link>

              <Link
                href="/magazine"
                className="text-[11px] sm:text-sm hover:opacity-70"
              >
                Magazine
              </Link>

              <Link
                href="/blog"
                className="text-[11px] sm:text-sm hover:opacity-70"
              >
                Blog
              </Link>

              <Link
                href="/about"
                className="text-[11px] sm:text-sm hover:opacity-70"
              >
                About Us
              </Link>

              <Link
                href="/admin"
                className="text-[11px] sm:text-sm hover:opacity-70"
              >
                Admin
              </Link>
            </nav>
          </div>
        </div>
        <div className="footer-legal">
          <span>© 2026 The Visionary Voice. All rights reserved.</span>
          <span>Independent perspectives on global business.</span>
        </div>
      </div>
    </footer>
  );
}
