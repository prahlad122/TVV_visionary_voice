"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon } from "lucide-react";
import { uploadToStorage } from "@/lib/upload";
import { FileDropzone } from "./file-dropzone";
import { SummaryPreview } from "@/components/magazine/summary-preview";
import { authClient } from "@/lib/auth-client";
import {
  createMagazineIssue,
  deleteMagazineIssue,
  regenerateIssueSummary,
  savePageContent,
  updateContact,
  updateMagazineIssue,
} from "@/lib/actions/admin";
import type { PageImage } from "@/lib/db/schema";

/** Matches the server limit in lib/actions/admin.ts; parsed PDF text can be long. */
const MAX_ARTICLE_CHARS = 1_000_000;
const GENERATING_NOTICE = "Generating a new summary.";

type Contact = {
  id: string;
  name: string;
  email: string;
  company: string;
  source: string;
  sourcePage: string;
  referrerHost: string;
  status: string;
  notes: string;
  emailConsent: boolean;
  createdAt: string;
};
type Issue = {
  id: string;
  title: string;
  description: string;
  articleText: string;
  summary: string;
  summaryStatus: string;
  summaryModel?: string;
  pageImages: PageImage[];
  industry: string;
  region: string;
  issueDate: string;
  coverUrl: string | null;
  fileUrl: string | null;
  fileName: string;
  fileSize: number;
  published: boolean;
  featured: boolean;
  createdAt: string;
};
type PageRecord = {
  slug: string;
  title: string;
  content: Record<string, string>;
  published: boolean;
};
type Analytics = {
  views: number;
  visitors: number;
  sessions: number;
  topSources: Array<{
    source: string;
    medium: string;
    campaign: string;
    referrer: string;
    views: number;
  }>;
  topPages: Array<{ path: string; views: number }>;
  devices: Array<{ device: string; views: number }>;
  recentEvents: Array<{
    eventType: string;
    path: string;
    source: string;
    referrer: string;
    createdAt: string;
  }>;
};
type DashboardProps = {
  userId: string;
  email: string;
  contacts: Contact[];
  issues: Issue[];
  pages: PageRecord[];
  analytics: Analytics;
  initialPanel?: string;
  savedIssueId?: string;
};
type Panel =
  | "overview"
  | "contacts"
  | "magazines"
  | "issues"
  | "pages"
  | "analytics";

const panels: Array<{ id: Panel; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "magazines", label: "Upload magazine" },
  { id: "issues", label: "Your issues" },
  { id: "pages", label: "Page editor" },
  { id: "analytics", label: "Analytics" },
];

export function AdminDashboard({
  userId,
  email,
  contacts,
  issues,
  pages,
  analytics,
  initialPanel,
  savedIssueId,
}: DashboardProps) {
  const router = useRouter();
  // `/admin?panel=issues` (used by the edit page) opens that tab.
  const [panel, setPanel] = useState<Panel>(
    () => panels.find((item) => item.id === initialPanel)?.id ?? "overview",
  );
  const savedTitle = savedIssueId
    ? issues.find((issue) => issue.id === savedIssueId)?.title
    : undefined;
  const [notice, setNotice] = useState(
    savedTitle ? `Changes to “${savedTitle}” saved.` : "",
  );
  const [pending, startTransition] = useTransition();

  // Drop `?saved=` from the address so a reload does not show the notice again.
  useEffect(() => {
    if (!savedIssueId) return;
    window.history.replaceState(null, "", "/admin?panel=issues");
    // Notes from the save (e.g. "Prepared 40 reader pages") are handed over by the edit page.
    try {
      const key = `issue-saved-note:${savedIssueId}`;
      const note = window.sessionStorage.getItem(key);
      window.sessionStorage.removeItem(key);
      if (note && savedTitle)
        setNotice(`Changes to “${savedTitle}” saved. ${note}`);
    } catch {
      /* Storage blocked: the plain confirmation stays. */
    }
  }, [savedIssueId, savedTitle]);

  // Notices belong to the tab they were shown on, so switching tabs clears them.
  function showPanel(next: Panel) {
    setPanel(next);
    setNotice("");
  }

  // Summaries are written in the background after a save, so the page cannot know when one
  // finishes. While one is pending and "Your issues" is open, re-read the data every few seconds
  // so "Generating summary…" is replaced by the result without a manual reload. Polling stops
  // on other tabs, and gives up after six minutes (AI reading a large PDF can take a few).
  const summaryPending = issues.some(
    (issue) => issue.summaryStatus === "pending",
  );
  const watching = summaryPending && panel === "issues";
  useEffect(() => {
    if (!watching) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt <= 360_000) return router.refresh();
      window.clearInterval(timer);
      setNotice((current) =>
        current === GENERATING_NOTICE
          ? "The summary is taking longer than usual. Reload this page later to see it."
          : current,
      );
    }, 5000);
    return () => window.clearInterval(timer);
  }, [watching, router]);

  // When a summary that was generating finishes, replace "Generating a new summary." with the
  // outcome, so a failed attempt does not leave the generating notice in place.
  const lastStatuses = useRef(new Map<string, string>());
  useEffect(() => {
    const finished: string[] = [];
    for (const issue of issues) {
      if (
        lastStatuses.current.get(issue.id) === "pending" &&
        issue.summaryStatus !== "pending"
      ) {
        finished.push(
          issue.summaryStatus === "ready"
            ? `The summary for “${issue.title}” is ready.`
            : `The summary for “${issue.title}” could not be generated. Try again in a minute.`,
        );
      }
      lastStatuses.current.set(issue.id, issue.summaryStatus);
    }
    if (finished.length) setNotice(finished.join(" "));
  }, [issues]);

  function runAction(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action();
        setNotice(success);
        router.refresh();
      } catch {
        setNotice("That change could not be saved. Please try again.");
      }
    });
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/sign-in");
  }

  return (
    <main className="admin-shell">
      <header className="container admin-topbar">
        <Link href="/" className="wordmark">
          <span className="wordmark-title">
            <span className="wordmark-the">The</span> Visionary Voice
          </span>
          <span className="wordmark-tagline">EDITORIAL CONTROL ROOM</span>
        </Link>
        <div className="admin-account">
          <span>{email}</span>
          <button className="secondary-button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <div className="container admin-content">
        <div className="admin-intro">
          <div>
            <span className="eyebrow">Administrator workspace</span>
            <h1 className="editorial">Your publication, in view.</h1>
            <p>
              Manage magazine issues, page copy, inquiries and consented
              audience analytics.
            </p>
          </div>
          <Link className="text-link" href="/">
            View website <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <nav className="admin-tabs" aria-label="Admin sections">
          {panels.map((item) => (
            <button
              key={item.id}
              className={panel === item.id ? "admin-tab active" : "admin-tab"}
              onClick={() => showPanel(item.id)}
              aria-current={panel === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {notice && (
          <p className="admin-notice" role="status">
            {notice}
          </p>
        )}
        {panel === "overview" && (
          <Overview
            contacts={contacts}
            issues={issues}
            analytics={analytics}
            onNavigate={showPanel}
          />
        )}
        {panel === "contacts" && (
          <ContactsPanel
            contacts={contacts}
            pending={pending}
            runAction={runAction}
          />
        )}
        {panel === "magazines" && (
          <MagazinesPanel
            issueCount={issues.length}
            userId={userId}
            runAction={runAction}
            onNavigate={showPanel}
          />
        )}
        {panel === "issues" && (
          <IssuesPanel
            issues={issues}
            userId={userId}
            runAction={runAction}
            onNavigate={showPanel}
          />
        )}
        {panel === "pages" && (
          <PagesPanel pages={pages} pending={pending} runAction={runAction} />
        )}
        {panel === "analytics" && <AnalyticsPanel analytics={analytics} />}
      </div>
    </main>
  );
}

function sourceLabel(source: {
  source: string;
  medium: string;
  campaign: string;
  referrer: string;
}) {
  const campaign = [source.source, source.medium, source.campaign]
    .filter(Boolean)
    .join(" / ");
  return campaign || source.referrer || "Direct / unknown";
}

function Overview({
  contacts,
  issues,
  analytics,
  onNavigate,
}: {
  contacts: Contact[];
  issues: Issue[];
  analytics: Analytics;
  onNavigate: (panel: Panel) => void;
}) {
  const newLeads = contacts.filter(
    (contact) => contact.status === "new",
  ).length;
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Last 30 days</span>
          <h2 className="editorial">A quick read on your publication</h2>
        </div>
        <p>Only visitors who opted into analytics are included.</p>
      </div>
      <div className="stat-grid">
        <Stat
          label="Page views"
          value={analytics.views.toLocaleString()}
          hint="Consent-based visits"
        />
        <Stat
          label="Unique visitors"
          value={analytics.visitors.toLocaleString()}
          hint="Pseudonymous sessions"
        />
        <Stat
          label="Contacts"
          value={contacts.length.toLocaleString()}
          hint={`${newLeads} new inquiries`}
        />
        <Stat
          label="Published issues"
          value={issues
            .filter((issue) => issue.published)
            .length.toLocaleString()}
          hint="In the public archive"
        />
      </div>
      <div className="admin-overview-grid">
        <section>
          <div className="admin-subheading">
            <h3 className="editorial">Top sources</h3>
            <button
              className="text-link"
              onClick={() => onNavigate("analytics")}
            >
              Full analytics <span aria-hidden="true">↗</span>
            </button>
          </div>
          {analytics.topSources.length ? (
            analytics.topSources.slice(0, 4).map((source, index) => (
              <div
                className="analytics-row"
                key={`${source.source}-${source.referrer}-${index}`}
              >
                <span>{sourceLabel(source)}</span>
                <strong>{source.views} views</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">
              No opted-in visits yet. Accept analytics on the public site to
              begin.
            </p>
          )}
        </section>
        <section>
          <div className="admin-subheading">
            <h3 className="editorial">Recently added contacts</h3>
            <button
              className="text-link"
              onClick={() => onNavigate("contacts")}
            >
              Open CRM <span aria-hidden="true">↗</span>
            </button>
          </div>
          {contacts.slice(0, 4).length ? (
            contacts.slice(0, 4).map((contact) => (
              <div className="analytics-row" key={contact.id}>
                <span>{contact.name}</span>
                <strong>{contact.status}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">Website inquiries will appear here.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function ContactsPanel({
  contacts,
  pending,
  runAction,
}: {
  contacts: Contact[];
  pending: boolean;
  runAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () =>
      contacts.filter((contact) =>
        `${contact.name} ${contact.email} ${contact.company} ${contact.source}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [contacts, search],
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const visibleContacts = filtered.filter(
    (contact) => statusFilter === "all" || contact.status === statusFilter,
  );

  function exportContacts() {
    const columns = [
      "Name",
      "Email",
      "Company",
      "Source",
      "Status",
      "Notes",
      "Source page",
      "Referrer",
      "Created at",
      "Email consent",
    ];
    const safeCell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = contacts.map((contact) => [
      contact.name,
      contact.email,
      contact.company,
      contact.source,
      contact.status,
      contact.notes,
      contact.sourcePage,
      contact.referrerHost,
      contact.createdAt,
      contact.emailConsent ? "Yes" : "No",
    ]);
    const csv = [columns, ...rows]
      .map((row) => row.map(safeCell).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `visionary-voice-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Customer relationship management</span>
          <h2 className="editorial">Website contacts</h2>
        </div>
        <div className="crm-toolbar">
          <label className="admin-search">
            Search contacts
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email or company"
            />
          </label>
          <label className="admin-field compact">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={exportContacts}
            disabled={!contacts.length}
          >
            Export CSV
          </button>
        </div>
      </div>
      <p className="crm-result-count">
        Showing {visibleContacts.length} of {contacts.length} contacts
      </p>
      {visibleContacts.length ? (
        <div className="contact-list">
          {visibleContacts.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              pending={pending}
              runAction={runAction}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No contacts found"
          body="Try another search or status. Newsletter sign-ups with email consent will appear here."
        />
      )}
    </section>
  );
}

function ContactCard({
  contact,
  pending,
  runAction,
}: {
  contact: Contact;
  pending: boolean;
  runAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [status, setStatus] = useState(contact.status);
  const [notes, setNotes] = useState(contact.notes);
  return (
    <article className="contact-card">
      <div className="contact-main">
        <div>
          <h3>{contact.name}</h3>
          <a href={`mailto:${contact.email}`}>{contact.email}</a>
          <p>
            {contact.company || "Independent"} · {contact.source} ·{" "}
            {contact.sourcePage}
          </p>
          <small>
            {contact.referrerHost || "Direct visit"} ·{" "}
            {new Date(contact.createdAt).toLocaleDateString()}
          </small>
        </div>
        <label className="admin-field compact">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <label className="admin-field">
        CRM notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={2}
          maxLength={3000}
          placeholder="Add a private follow-up note"
        />
      </label>
      <div className="contact-card-footer">
        <span>
          {contact.emailConsent
            ? "Email consent recorded"
            : "No marketing consent"}
        </span>
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() =>
            runAction(
              () => updateContact(contact.id, { status, notes }),
              "Contact updated.",
            )
          }
        >
          Save contact
        </button>
      </div>
    </article>
  );
}

type RunAction = (action: () => Promise<unknown>, success: string) => void;

function MagazinesPanel({
  issueCount,
  userId,
  runAction,
  onNavigate,
}: {
  issueCount: number;
  userId: string;
  runAction: RunAction;
  onNavigate: (panel: Panel) => void;
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Publication library</span>
          <h2 className="editorial">Upload a new issue</h2>
        </div>
        <p>
          Provide a PDF, article text file, or pasted article. PDFs may be up to
          400 MB.
        </p>
      </div>
      <UploadIssueForm
        userId={userId}
        runAction={runAction}
        onNavigate={onNavigate}
      />
      {issueCount > 0 && (
        <p className="issue-library-link">
          {issueCount} {issueCount === 1 ? "issue" : "issues"} uploaded so far.{" "}
          <button
            className="text-link"
            type="button"
            onClick={() => onNavigate("issues")}
          >
            Open your issues <span aria-hidden="true">→</span>
          </button>
        </p>
      )}
    </section>
  );
}

function IssuesPanel({
  issues,
  userId,
  runAction,
  onNavigate,
}: {
  issues: Issue[];
  userId: string;
  runAction: RunAction;
  onNavigate: (panel: Panel) => void;
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Publication library</span>
          <h2 className="editorial">
            Your issues <span className="issue-count">{issues.length}</span>
          </h2>
        </div>
        <p>
          Draft issues stay private until published. Open an issue’s summary to
          read it.
        </p>
      </div>
      {issues.length ? (
        <div className="managed-issues">
          {issues.map((issue) => (
            <IssueManager
              key={issue.id}
              issue={issue}
              userId={userId}
              runAction={runAction}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h3 className="editorial">No magazine issues yet</h3>
          <p>Start with a PDF, a text article file, or pasted article copy.</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => onNavigate("magazines")}
          >
            Upload a magazine
          </button>
        </div>
      )}
    </section>
  );
}

function UploadIssueForm({
  userId,
  runAction,
  onNavigate,
}: {
  userId: string;
  runAction: RunAction;
  onNavigate: (panel: Panel) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uploaded, setUploaded] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStage, setUploadStage] = useState("Uploading magazine files…");
  const [parseStatus, setParseStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setUploaded(false);
    const form = event.currentTarget;
    const data = new FormData(form);
    const pdf = data.get("pdf");
    const selectedPdf = pdf instanceof File && pdf.size ? pdf : null;
    const cover = data.get("cover");
    const articleFile = data.get("articleFile");
    let articleText = String(data.get("articleText") ?? "").trim();
    if (
      selectedPdf &&
      (selectedPdf.type !== "application/pdf" ||
        selectedPdf.size > 400 * 1024 * 1024)
    ) {
      setMessage("Choose a PDF issue that is 400 MB or smaller.");
      setBusy(false);
      return;
    }
    if (
      cover instanceof File &&
      cover.size &&
      (!["image/jpeg", "image/png", "image/webp"].includes(cover.type) ||
        cover.size > 8 * 1024 * 1024)
    ) {
      setMessage("Cover must be JPG, PNG or WebP and 8 MB or smaller.");
      setBusy(false);
      return;
    }
    if (articleFile instanceof File && articleFile.size) {
      if (
        !articleFile.name.toLowerCase().endsWith(".txt") ||
        articleFile.size > 500_000
      ) {
        setMessage("Article file must be a .txt file no larger than 500 KB.");
        setBusy(false);
        return;
      }
      try {
        articleText = (await articleFile.text()).trim();
      } catch {
        setMessage(
          "The article text file could not be read. Save it as UTF-8 .txt and try again.",
        );
        setBusy(false);
        return;
      }
    }
    if (articleText.length > 120_000) {
      setMessage("Article text must be 120,000 characters or fewer.");
      setBusy(false);
      return;
    }
    if (!articleText && !selectedPdf) {
      setMessage("Choose a PDF, upload a .txt article, or paste article text.");
      setBusy(false);
      return;
    }

    const id = crypto.randomUUID();
    const safeName = (file: File) =>
      file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
    const totalBytes =
      (selectedPdf?.size ?? 0) + (cover instanceof File ? cover.size : 0);
    const uploadedBytes = { pdf: 0, cover: 0 };
    // The bar covers the whole job: the files' bytes and, for a PDF, every reader page image.
    // Each counts for half, so it cannot reach 100% while pages are still uploading.
    const pages = { done: 0, total: 0 };
    const updateProgress = () => {
      const files = totalBytes
        ? (uploadedBytes.pdf + uploadedBytes.cover) / totalBytes
        : 1;
      const done = selectedPdf
        ? (files + (pages.total ? pages.done / pages.total : 0)) / 2
        : files;
      setUploadProgress(Math.min(99, Math.floor(done * 100)));
    };
    const reportProgress = (
      asset: keyof typeof uploadedBytes,
      loaded: number,
    ) => {
      uploadedBytes[asset] = Math.max(uploadedBytes[asset], loaded);
      updateProgress();
    };
    // Prepare the PDF for readers in the browser while the original uploads:
    // read each page's text and render each page to a screen-sized image that
    // the magazine reader shows instead of the PDF. The file is already in
    // memory here, so nothing is downloaded and the server never parses a
    // 300 MB file. The original PDF stays untouched as the download.
    const title = String(data.get("title") ?? "").trim();
    let prepareFailure = "";
    const preparedPdf = selectedPdf
      ? selectedPdf
          .arrayBuffer()
          .then(async (buffer) =>
            (await import("@/lib/pdf-text")).preparePdfForReaders(
              { data: buffer },
              {
                issueId: id,
                userId,
                title,
                onProgress: setParseStatus,
                onPagesDone: (done, total) => {
                  pages.done = done;
                  pages.total = total;
                  updateProgress();
                },
              },
            ),
          )
          .catch((error: unknown) => {
            console.error("Preparing the PDF for readers failed:", error);
            prepareFailure = preparationErrorMessage(error);
            return null;
          })
      : null;
    setParseStatus(preparedPdf ? "Preparing pages for readers…" : "");
    try {
      setUploadProgress(0);
      setUploadStage("Uploading magazine files…");
      let coverUrl = "";
      if (cover instanceof File && cover.size) {
        coverUrl = await uploadToStorage(cover, {
          issueId: id,
          assetType: "cover",
          filename: `cover-${safeName(cover)}`,
          onProgress: (loaded) => reportProgress("cover", loaded),
        });
      }
      let issueFileUrl: string | undefined;
      if (selectedPdf) {
        // R2 accepts single uploads of up to 5 GB, so even a 400 MB PDF goes up in one request.
        issueFileUrl = await uploadToStorage(selectedPdf, {
          issueId: id,
          assetType: "issue",
          filename: `issue-${safeName(selectedPdf)}`,
          onProgress: (loaded) => reportProgress("pdf", loaded),
        });
      }
      let parseNote = "";
      let pageImages: PageImage[] = [];
      if (preparedPdf) {
        setUploadStage("Uploading reader pages…");
        const prepared = await preparedPdf;
        if (!prepared) {
          parseNote = ` ${prepareFailure || "The reader pages could not be prepared."} Until then the magazine view loads the PDF directly; use “Prepare for readers” on the issue to retry.`;
        } else {
          pageImages = prepared.pageImages;
          parseNote = ` Prepared ${pageImages.length} reader pages.`;
          const parsed = prepared.text;
          // Without readable text the AI still writes the summary: Gemini reads the PDF itself.
          const fromPdf =
            " The AI summary is being written from the PDF itself.";
          if (articleText) parseNote += " The summary is being generated.";
          else if (!parsed.text)
            parseNote += ` No readable text was found (the PDF ${parsed.readable ? "may be scanned images" : "uses fonts that do not map to letters"}).${fromPdf}`;
          else if (parsed.text.length > MAX_ARTICLE_CHARS)
            parseNote += ` The PDF text is longer than ${MAX_ARTICLE_CHARS.toLocaleString("en-US")} characters, so it was not saved.${fromPdf}`;
          else {
            articleText = parsed.text;
            parseNote += ` Read the text of ${parsed.pages.length} of ${parsed.pageCount} pages${parsed.unreadablePages ? ` (${parsed.unreadablePages} had unreadable fonts and were skipped)` : ""}; the summary is being generated.`;
          }
        }
      } else if (articleText) {
        parseNote = " The summary is being generated.";
      }
      setParseStatus("");
      setUploadProgress(100);
      setUploadStage("Saving issue details…");
      await createMagazineIssue({
        id,
        title,
        description: String(data.get("description") ?? "").trim(),
        articleText,
        industry: String(data.get("industry") ?? "").trim(),
        region: String(data.get("region") ?? "").trim(),
        issueDate: String(data.get("issueDate") ?? ""),
        fileUrl: issueFileUrl,
        coverUrl,
        fileName: selectedPdf?.name,
        fileSize: selectedPdf?.size,
        pageImages,
      });
      form.reset();
      setUploadProgress(null);
      setMessage(
        `Issue uploaded as a draft.${parseNote} Publish it when it is ready for readers.`,
      );
      setUploaded(true);
      runAction(async () => undefined, "Magazine library refreshed.");
    } catch (error) {
      console.error("Magazine upload error:", error);
      setUploadProgress(null);
      setParseStatus("");

      setMessage(
        error instanceof Error
          ? error.message
          : "Upload could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="upload-form" onSubmit={submit}>
      <div className="upload-form-heading">
        <div>
          <h3 className="editorial">Add a new magazine</h3>
          <p>
            Upload artwork and publication details; the issue begins as a draft.
          </p>
        </div>
      </div>
      <div className="upload-fields">
        <label className="admin-field">
          Issue title
          <input
            name="title"
            required
            maxLength={180}
            placeholder="e.g. Women Who Inspire the Industry, 2026"
          />
        </label>
        <label className="admin-field">
          Issue date
          <input name="issueDate" type="date" />
        </label>
        <label className="admin-field">
          Industry
          <input
            name="industry"
            maxLength={80}
            placeholder="Leadership, healthcare…"
          />
        </label>
        <label className="admin-field">
          Region
          <input name="region" maxLength={80} placeholder="Global, America…" />
        </label>
        <label className="admin-field wide">
          Description
          <textarea
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Short issue description"
          />
        </label>
        <p className="admin-field wide upload-source-note">
          Provide any one: a PDF, a .txt article, or pasted text. Article text
          gives readers the fastest experience.
        </p>
        <FileDropzone
          name="pdf"
          label="Magazine PDF (optional)"
          accept="application/pdf,.pdf"
          hint="PDF up to 400 MB"
          icon={<FileText />}
        />
        <FileDropzone
          name="cover"
          label="Cover image (optional)"
          accept="image/jpeg,image/png,image/webp"
          hint="JPG, PNG or WebP up to 8 MB"
          icon={<ImageIcon />}
        />
        <FileDropzone
          name="articleFile"
          label="Article text file (optional)"
          accept=".txt,text/plain"
          hint=".txt file up to 500 KB"
          className="wide"
        />
        <label className="admin-field wide">
          Or paste article text
          <textarea
            name="articleText"
            rows={10}
            maxLength={120000}
            placeholder="Paste the article text here. Use a blank line between paragraphs. Lines starting with # become section headings."
          />
          <small>
            Up to 120,000 characters. Text files take priority if both are
            provided.
          </small>
        </label>
      </div>
      {message && (
        <p className="form-message" role="status">
          {message}
          {uploaded && (
            <>
              {" "}
              <button
                className="text-link"
                type="button"
                onClick={() => onNavigate("issues")}
              >
                See it in Your issues <span aria-hidden="true">→</span>
              </button>
            </>
          )}
        </p>
      )}
      {busy && uploadProgress !== null && (
        <div className="upload-progress" role="status" aria-live="polite">
          <div className="upload-progress-label">
            <span>{uploadStage}</span>
            <strong>{uploadProgress}%</strong>
          </div>
          <progress
            max="100"
            value={uploadProgress}
            aria-label={`Magazine upload ${uploadProgress}% complete`}
          />
          {parseStatus && (
            <small className="upload-parse-status">{parseStatus}</small>
          )}
        </div>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? "Uploading…" : "Upload magazine"}
      </button>
    </form>
  );
}

/** Turn a preparation failure into something an editor can act on. */
function preparationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/CORS/i.test(message))
    return `${message} The bucket must allow PUT and GET from this site's address.`;
  return message
    ? `The PDF could not be prepared: ${message}`
    : "The PDF could not be prepared.";
}

const summaryStatusLabel: Record<string, string> = {
  pending: "Generating summary…",
  failed: "The summary could not be generated.",
};

function IssueManager({
  issue,
  userId,
  runAction,
}: {
  issue: Issue;
  userId: string;
  runAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [articleText, setArticleText] = useState(issue.articleText ?? "");
  const [parseStatus, setParseStatus] = useState("");
  const [parsing, setParsing] = useState(false);
  const pdfUrl = issue.fileUrl
    ? `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=issue`
    : null;
  const hasText = Boolean(issue.articleText.trim());
  const hasPages = issue.pageImages.length > 0;

  // For issues uploaded before upload-time preparation existed (or to redo it):
  // download the stored PDF once, then render its reader pages and read its text.
  async function prepareStoredPdf() {
    if (!pdfUrl) return;
    setParsing(true);
    setParseStatus("Downloading PDF…");
    try {
      const response = await fetch(pdfUrl, { credentials: "same-origin" });
      if (!response.ok) {
        const detail = await response
          .json()
          .then((body: { error?: string }) => body.error)
          .catch(() => undefined);
        throw new Error(detail ?? `PDF request failed with ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      const { preparePdfForReaders } = await import("@/lib/pdf-text");
      const { text, pageImages } = await preparePdfForReaders(
        { data: buffer },
        {
          issueId: issue.id,
          userId,
          title: issue.title,
          onProgress: setParseStatus,
        },
      );
      const useText =
        !hasText &&
        text.readable &&
        text.text &&
        text.text.length <= MAX_ARTICLE_CHARS;
      if (useText) setArticleText(text.text);
      setParseStatus(
        !hasText && !useText
          ? "Reader pages are ready. No readable text was found, so the AI summary is written from the PDF itself."
          : "",
      );
      runAction(
        () =>
          updateMagazineIssue(
            issue.id,
            useText ? { pageImages, articleText: text.text } : { pageImages },
          ),
        `Prepared ${pageImages.length} reader pages${useText ? ` and ${text.pages.length} pages of text; the summary is being generated` : ""}.`,
      );
    } catch (error) {
      console.error("Preparing the PDF for readers failed:", error);
      setParseStatus(preparationErrorMessage(error));
    } finally {
      setParsing(false);
    }
  }

  const summaryState =
    issue.summaryStatus === "pending"
      ? "generating…"
      : issue.summary
        ? "ready"
        : issue.summaryStatus === "failed"
          ? "failed"
          : "none yet";
  const summaryNote =
    issue.summary && issue.summaryStatus === "ready" ? (
      <p className="managed-issue-note">
        {issue.summaryModel === "edited"
          ? "Edited by hand."
          : issue.summaryModel
            ? `Written by AI (${issue.summaryModel}) from the ${issue.summaryModel.startsWith("gemini") ? "PDF" : "extracted text"}.`
            : "Built from the issue’s own sentences, because no AI model was available. Add GEMINI_API_KEY or GROQ_API_KEY, then regenerate."}
      </p>
    ) : null;
  const summaryActions = (
    <div className="managed-issue-summary-actions">
      {pdfUrl && (
        <span className="managed-issue-note">
          {hasPages
            ? `${issue.pageImages.length} reader pages ready`
            : "Reader pages not prepared: the magazine view loads the PDF directly."}
        </span>
      )}
      {pdfUrl && (!hasPages || !hasText) && (
        <button
          className="secondary-button"
          type="button"
          disabled={parsing}
          onClick={() => void prepareStoredPdf()}
        >
          {parsing ? "Preparing…" : "Prepare for readers"}
        </button>
      )}
      {(issue.articleText.trim() || pdfUrl) &&
        issue.summaryStatus !== "pending" && (
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              runAction(
                () => regenerateIssueSummary(issue.id),
                GENERATING_NOTICE,
              )
            }
          >
            {issue.summary ? "Regenerate summary" : "Generate summary"}
          </button>
        )}
      {parseStatus && <small role="status">{parseStatus}</small>}
    </div>
  );
  // A two-line preview keeps the list short; "Read the full summary" opens the rest, with
  // where it came from and the summary actions.
  const summaryBlock = (
    <div className="managed-issue-summary">
      <div className="managed-issue-summary-head">
        <span className="eyebrow">Summary</span>
        <span className={`summary-state is-${issue.summaryStatus || "none"}`}>
          {summaryState}
        </span>
      </div>
      {issue.summary ? (
        <SummaryPreview
          summary={issue.summary}
          headingLevel={5}
          lines={2}
          moreLabel="Read the full summary"
        >
          {summaryNote}
          {summaryActions}
        </SummaryPreview>
      ) : (
        <>
          <p className="managed-issue-note">
            {summaryStatusLabel[issue.summaryStatus] ??
              (issue.articleText.trim() || pdfUrl
                ? "No summary yet."
                : "Add a PDF or article text to generate a summary.")}
          </p>
          {summaryActions}
        </>
      )}
    </div>
  );

  return (
    <article className="managed-issue">
      <div className="managed-issue-copy">
        <div>
          <h4 className="editorial">{issue.title}</h4>
          <p>
            {issue.industry || "Business"} · {issue.region || "Global"} ·{" "}
            {issue.issueDate ||
              new Date(issue.createdAt).toLocaleDateString("en-US", {
                timeZone: "UTC",
              })}
          </p>
          <span
            className={
              issue.published ? "status-pill published" : "status-pill"
            }
          >
            {issue.published ? "Published" : "Draft"}
          </span>
          {issue.featured && (
            <span className="status-pill featured">Featured</span>
          )}
        </div>
        <div className="managed-issue-actions">
          <Link
            className="primary-button"
            href={`/admin/issues/${encodeURIComponent(issue.id)}/edit`}
          >
            Edit
          </Link>
          {issue.published ? (
            <a
              className="text-link"
              href={`/read/${encodeURIComponent(issue.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              View <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span
              className="managed-issue-note"
              title="Readers can open it once it is published"
            >
              Not live yet
            </span>
          )}
          {issue.fileUrl && (
            <a
              className="text-link"
              href={`/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=issue`}
              target="_blank"
              rel="noreferrer"
            >
              Preview PDF <span aria-hidden="true">↗</span>
            </a>
          )}
          <button
            className="secondary-button"
            onClick={() =>
              runAction(
                () =>
                  updateMagazineIssue(issue.id, {
                    published: !issue.published,
                  }),
                issue.published ? "Issue unpublished." : "Issue published.",
              )
            }
          >
            {issue.published ? "Unpublish" : "Publish"}
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              runAction(
                () =>
                  updateMagazineIssue(issue.id, { featured: !issue.featured }),
                issue.featured
                  ? "Featured issue cleared."
                  : "Issue set as featured.",
              )
            }
          >
            {issue.featured ? "Remove featured" : "Feature issue"}
          </button>
          <button
            className="text-danger"
            onClick={() => {
              if (window.confirm("Delete this issue and its uploaded files?"))
                runAction(
                  () => deleteMagazineIssue(issue.id),
                  "Issue deleted.",
                );
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {summaryBlock}
      <details className="issue-article-editor">
        <summary>
          {articleText.trim() ? "Edit article text" : "Add article text"}
        </summary>
        <label className="admin-field">
          Article text
          <textarea
            value={articleText}
            onChange={(event) => setArticleText(event.target.value)}
            rows={10}
            maxLength={MAX_ARTICLE_CHARS}
            placeholder="Paste the article text here. Use a blank line between paragraphs; lines starting with # become section headings."
          />
          <small>
            {articleText.length.toLocaleString("en-US")} /{" "}
            {MAX_ARTICLE_CHARS.toLocaleString("en-US")} characters
          </small>
        </label>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            runAction(
              () => updateMagazineIssue(issue.id, { articleText }),
              "Article text saved.",
            )
          }
        >
          Save article text
        </button>
      </details>
    </article>
  );
}

function PagesPanel({
  pages,
  pending,
  runAction,
}: {
  pages: PageRecord[];
  pending: boolean;
  runAction: (action: () => Promise<unknown>, success: string) => void;
}) {
  const [slug, setSlug] = useState(pages[0]?.slug ?? "home");
  const page = pages.find((item) => item.slug === slug) ?? pages[0];
  const [content, setContent] = useState<Record<string, string>>(
    page?.content ?? {},
  );
  const [title, setTitle] = useState(page?.title ?? "");
  const [published, setPublished] = useState(page?.published ?? false);

  function choosePage(nextSlug: string) {
    const nextPage = pages.find((item) => item.slug === nextSlug);
    if (!nextPage) return;
    setSlug(nextSlug);
    setTitle(nextPage.title);
    setContent(nextPage.content);
    setPublished(nextPage.published);
  }

  if (!page)
    return (
      <EmptyState
        title="No editable pages"
        body="Page defaults could not be loaded."
      />
    );
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Content management</span>
          <h2 className="editorial">Edit your pages</h2>
        </div>
        <p>Changes publish to the public site when you choose Publish.</p>
      </div>
      <div className="page-editor-toolbar">
        <label className="admin-field compact">
          Page
          <select
            value={slug}
            onChange={(event) => choosePage(event.target.value)}
          >
            {pages.map((item) => (
              <option value={item.slug} key={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <span className={published ? "status-pill published" : "status-pill"}>
          {published ? "Published" : "Draft"}
        </span>
      </div>
      <div className="page-editor-fields">
        <label className="admin-field">
          Page label
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
          />
        </label>
        {Object.entries(content).map(([key, value]) => (
          <label className="admin-field wide" key={key}>
            {fieldLabel(key)}
            <textarea
              rows={
                key.toLowerCase().includes("description") ||
                key.toLowerCase().includes("intro")
                  ? 4
                  : 2
              }
              value={value}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
              maxLength={4000}
            />
          </label>
        ))}
      </div>
      <div className="page-editor-actions">
        <button
          className="secondary-button"
          disabled={pending}
          onClick={() => {
            setPublished(false);
            runAction(
              () => savePageContent({ slug, title, content, published: false }),
              "Draft saved.",
            );
          }}
        >
          Save draft
        </button>
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => {
            setPublished(true);
            runAction(
              () => savePageContent({ slug, title, content, published: true }),
              "Page published.",
            );
          }}
        >
          Publish page
        </button>
      </div>
    </section>
  );
}

function fieldLabel(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <div>
          <span className="eyebrow">Consent-based analytics · 30 days</span>
          <h2 className="editorial">Who is finding the magazine?</h2>
        </div>
        <p>
          Visitors are counted only after opt-in. No raw IP address, full URL
          query, or raw browser fingerprint is stored.
        </p>
      </div>
      <div className="stat-grid">
        <Stat
          label="Page views"
          value={analytics.views.toLocaleString()}
          hint="Opted-in page views"
        />
        <Stat
          label="Unique visitors"
          value={analytics.visitors.toLocaleString()}
          hint="30-day pseudonymous count"
        />
        <Stat
          label="Top pages"
          value={analytics.topPages.length.toLocaleString()}
          hint="Pages with visits"
        />
        <Stat
          label="Traffic sources"
          value={analytics.topSources.length.toLocaleString()}
          hint="Referrer / campaign groups"
        />
      </div>
      <div className="admin-overview-grid">
        <section>
          <h3 className="editorial">Where people came from</h3>
          {analytics.topSources.length ? (
            analytics.topSources.map((item, index) => (
              <div
                className="analytics-row"
                key={`${item.source}-${item.referrer}-${index}`}
              >
                <span>{sourceLabel(item)}</span>
                <strong>{item.views}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">
              No analytics data yet. Visitors must accept analytics on the
              website first.
            </p>
          )}
        </section>
        <section>
          <h3 className="editorial">Most viewed pages</h3>
          {analytics.topPages.length ? (
            analytics.topPages.map((item) => (
              <div className="analytics-row" key={item.path}>
                <span>{item.path}</span>
                <strong>{item.views}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">
              Page views will appear here after visitors opt in.
            </p>
          )}
          <h3 className="editorial" style={{ marginTop: 24 }}>
            Device groups
          </h3>
          {analytics.devices.length ? (
            analytics.devices.map((item) => (
              <div className="analytics-row" key={item.device}>
                <span>{item.device}</span>
                <strong>{item.views}</strong>
              </div>
            ))
          ) : (
            <p className="empty-copy">
              Device groups appear after consented visits.
            </p>
          )}
        </section>
      </div>
      <div className="admin-subheading">
        <h3 className="editorial">Recent consented visits</h3>
      </div>
      <div className="event-list">
        {analytics.recentEvents.map((event, index) => (
          <div className="analytics-row" key={`${event.createdAt}-${index}`}>
            <span>
              {event.path} · {event.source || event.referrer || "Direct"}
            </span>
            <small>{new Date(event.createdAt).toLocaleString()}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3 className="editorial">{title}</h3>
      <p>{body}</p>
    </div>
  );
}
