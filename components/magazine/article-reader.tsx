"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen, Download, ExternalLink } from "lucide-react";
import { tidyExtractedText } from "@/lib/text-tidy";
import { SummaryPreview } from "./summary-preview";
import type { Issue } from "./issue-cover";
import { RailSection, type RailItem } from "./explore-rail";
import { SubscribeButton } from "@/components/subscribe-button";

function paragraphs(text: string) {
  const parts = text
    .split(/\n\s*\n/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // PDF text boxes can split one sentence across two blocks ("…expects evidence of" /
  // "practical engineering capability."). Rejoin a block that stops mid-sentence with the
  // next block when that one continues in lowercase.
  const merged: string[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    const continues =
      previous &&
      !previous.startsWith("# ") &&
      !part.startsWith("# ") &&
      (/[,–—-]$/.test(previous) ||
        (!/[.!?:;"”’)]$/.test(previous) && /^[\p{Ll}]/u.test(part)));
    if (continues) merged[merged.length - 1] = `${previous} ${part}`;
    else merged.push(part);
  }
  return merged;
}

function EditorialCopy({ text }: { text: string }) {
  return (
    <>
      {paragraphs(text).map((block, index) =>
        block.startsWith("# ") ? (
          <h2 key={index}>{block.slice(2)}</h2>
        ) : (
          <p key={index}>{block.replace(/\n+/g, " ")}</p>
        ),
      )}
    </>
  );
}

/**
 * Shows the article text stored when the issue was uploaded, so the page opens
 * instantly. It never downloads the PDF: issues without stored text point
 * readers to the magazine view instead.
 */
export function ArticleReader({
  issue,
  blogPosts = [],
}: {
  issue: Issue;
  /** The latest blog posts, shown in the right-hand panel under "From the blog". */
  blogPosts?: RailItem[];
}) {
  const bookHref = `/read/${encodeURIComponent(issue.id)}/book`;
  const ads = [
    {
      label: "Explore the edition",
      title: issue.coverName,
      detail:
        issue.description || `Discover more perspectives in ${issue.industry}.`,
      image: issue.image,
      href: "/magazine",
    },
  ];

  return (
    <div className="article-shell">
      <header className="article-header">
        <Link className="article-back" href="/magazine">
          <ArrowLeft aria-hidden="true" /> <span>All editions</span>
        </Link>
        <Link className="article-wordmark" href="/">
          The Visionary Voice
        </Link>
        <div className="header-actions">
          {/* {issue.fileUrl && (
            <a
              className="header-download"
              href={`${issue.fileUrl}&download=1`}
              aria-label="Download the issue PDF"
            >
              <Download aria-hidden="true" />
              <span>Download</span>
            </a>
          )} */}
          <SubscribeButton className="article-subscribe" />
        </div>
      </header>
      <main className="article-layout">
        <article className="issue-article">
          <div className="article-kicker">
            {issue.industry} <span>·</span> {issue.region} <span>·</span>{" "}
            {issue.date}
          </div>
          <h1 className="editorial">{issue.title}</h1>
          <p className="article-deck">
            {issue.description ||
              `A ${issue.industry.toLowerCase()} perspective from ${issue.region}.`}
          </p>
          <figure className="article-lead-image">
            <Image
              src={issue.image}
              alt={`Cover image for ${issue.title}`}
              fill
              priority
              sizes="(max-width: 720px) 100vw, 760px"
            />
            <figcaption>
              From the {issue.date} {issue.industry} edition
            </figcaption>
          </figure>
          <div className="article-byline">
            <span>THE VISIONARY VOICE</span>
            <span>{issue.date}</span>
            {issue.fileUrl && (
              <Link href={bookHref}>
                <BookOpen aria-hidden="true" /> Read as a magazine
              </Link>
            )}
          </div>
          {/* The description is already the deck under the title, so it is not repeated here. */}
          {issue.summary ? (
            <section
              className="article-body summary-article"
              aria-label="The issue in brief"
            >
              <span className="eyebrow">The issue in brief</span>
              <SummaryPreview summary={issue.summary} lines={7} />
              {/* {issue.fileUrl && <p className="summary-cta"><Link className="text-link" href={bookHref}><BookOpen aria-hidden="true" /> Read the full issue as a magazine</Link></p>} */}
            </section>
          ) : (
            <section
              className="article-body"
              aria-label="Issue article content"
            >
              {issue.articleText?.trim() ? (
                <EditorialCopy text={tidyExtractedText(issue.articleText)} />
              ) : (
                <p className="article-message">
                  The article text for this issue is not available yet.
                  {issue.fileUrl && (
                    <>
                      {" "}
                      <Link className="text-link" href={bookHref}>
                        Read the full issue as a magazine
                      </Link>
                      .
                    </>
                  )}
                </p>
              )}
            </section>
          )}
        </article>
        <aside
          className={blogPosts.length ? "article-ad-rail has-sections" : "article-ad-rail"}
          aria-label="Sponsored stories and recommendations"
        >
          <div className="article-ad-heading">
            <span>Discover</span>
            <h2 className="editorial">More to explore</h2>
          </div>
          {ads.map((ad) => (
            <Link className="article-ad-card" href={ad.href} key={ad.title}>
              <div className="article-ad-image">
                <Image
                  src={ad.image}
                  alt=""
                  fill
                  sizes="(max-width: 720px) 50vw, 300px"
                />
              </div>
              <div className="article-ad-copy">
                <span>{ad.label}</span>
                <h3 className="editorial">{ad.title}</h3>
                <p>{ad.detail}</p>
                <b>
                  Explore <ExternalLink aria-hidden="true" />
                </b>
              </div>
            </Link>
          ))}
          <Link className="article-archive-link" href="/magazine">
            Browse all magazine editions <span>→</span>
          </Link>
          <RailSection
            eyebrow="The blog"
            title="From the blog"
            items={blogPosts}
            moreHref="/blog"
            moreLabel="Read all blog posts"
          />
        </aside>
      </main>
    </div>
  );
}
