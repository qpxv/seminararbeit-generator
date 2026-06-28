"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
import { HEADER, OUTPUT_PAGE } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { SessionResult, ReviewChange } from "@/lib/types";

export default function OutputPage() {
  const router = useRouter();
  const [result, setResult] = useState<SessionResult | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [quellenNames, setQuellenNames] = useState<string[]>([]);
  const [zielWortanzahl, setZielWortanzahl] = useState<number | undefined>(undefined);

  useEffect(() => {
    const raw = sessionStorage.getItem("generatorResult");
    if (!raw) {
      router.replace("/");
      return;
    }
    const parsed = JSON.parse(raw) as SessionResult;
    setResult(parsed);

    const inputRaw = sessionStorage.getItem("generatorInput");
    if (inputRaw) {
      const input = JSON.parse(inputRaw);
      setQuellenNames(input.quellenFiles?.map((f: { name: string }) => f.name) ?? []);
      setZielWortanzahl(input.zielWortanzahl);
    }
  }, [router]);

  async function handleDownload() {
    if (!result) return;
    setIsDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch("/api/assemble-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentContent: result.finalDocument,
          leitfadenRules: result.leitfadenRules,
          zielWortanzahl,
        }),
      });

      if (!response.ok) {
        let message = "Download fehlgeschlagen";
        try {
          const errData = await response.json();
          if (errData.errors?.length) {
            message = errData.errors.join(" • ");
          }
        } catch { /* ignore parse error */ }
        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Seminararbeit.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(String(err instanceof Error ? err.message : err));
    } finally {
      setIsDownloading(false);
    }
  }

  function ratingClass(rating: string) {
    if (rating === "gut")
      return "bg-fom-primary-bg text-fom-primary-darker";
    if (rating === "akzeptabel")
      return "bg-fom-yellow/20 text-fom-grey-700";
    return "bg-fom-red/10 text-fom-red";
  }

  if (!result) return null;

  const generatedAt = result.finalDocument.metadata.generatedAt
    ? new Date(result.finalDocument.metadata.generatedAt).toLocaleDateString("de-DE")
    : "";

  return (
    <div className="min-h-screen bg-fom-grey-97 flex flex-col">
      <header className="bg-fom-primary h-16 flex items-center px-6 shrink-0 sticky top-0 z-10">
        <img src="/fom-logo.png" alt={HEADER.logoAlt} className="h-8 mr-4" />
        <span className="text-white font-medium text-base">{HEADER.appName}</span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[600px] space-y-4">
          {/* Success Card */}
          <div className="bg-fom-primary-bg border border-fom-primary-light rounded-fom-md p-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-fom-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-fom-black mb-2">
              {OUTPUT_PAGE.successTitle}
            </h1>
            <p className="text-fom-grey-600 text-sm">
              {result.finalDocument.metadata.titel}
              {generatedAt && ` · ${generatedAt}`}
            </p>
          </div>

          {/* Download Error */}
          {downloadError && (
            <div className="bg-red-50 border border-fom-red rounded-fom-sm p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-fom-red shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-fom-red mb-1">Download fehlgeschlagen</p>
                  <p className="text-xs text-fom-red/80">{downloadError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full bg-fom-primary text-white font-bold rounded-fom-sm py-4 text-lg hover:bg-fom-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <Download className="w-5 h-5" />
            {isDownloading ? OUTPUT_PAGE.downloading : OUTPUT_PAGE.downloadButton}
          </button>

          {/* File Structure */}
          <div className="bg-white border border-fom-grey-100 rounded-fom-md p-6">
            <h2 className="text-sm font-medium text-fom-grey-700 mb-3">
              {OUTPUT_PAGE.fileStructureTitle}
            </h2>
            <div className="font-mono text-sm text-fom-grey-700 space-y-1">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-fom-primary shrink-0" />
                <span>Seminararbeit/</span>
              </div>
              <div className="flex items-center gap-2 ml-6">
                <FileText className="w-4 h-4 text-fom-grey-400 shrink-0" />
                <button
                  onClick={handleDownload}
                  className="text-fom-primary underline hover:text-fom-primary-dark transition-colors"
                >
                  seminararbeit.docx
                </button>
              </div>
              {quellenNames.length > 0 && (
                <>
                  <div className="flex items-center gap-2 ml-6">
                    <FileText className="w-4 h-4 text-fom-grey-400 shrink-0" />
                    <span className="text-fom-grey-600">Quellen/</span>
                  </div>
                  {quellenNames.map((name) => (
                    <div key={name} className="flex items-center gap-2 ml-12">
                      <FileText className="w-4 h-4 text-fom-grey-400 shrink-0" />
                      <span className="text-fom-grey-600">{name}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Review Log */}
          <div className="bg-white border border-fom-grey-100 rounded-fom-md overflow-hidden">
            <button
              onClick={() => setIsReviewOpen((o) => !o)}
              className="w-full flex items-center justify-between p-4 hover:bg-fom-grey-97 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fom-grey-700">
                  {OUTPUT_PAGE.reviewLogTitle}
                </span>
                <span className="bg-fom-grey-50 text-fom-grey-600 text-xs rounded-fom-sm px-2 py-0.5">
                  {result.reviewLog.length} {OUTPUT_PAGE.iterationLabel}
                </span>
                {result.reviewChanges?.length > 0 && (
                  <span className="bg-fom-yellow/20 text-fom-grey-700 text-xs rounded-fom-sm px-2 py-0.5">
                    {result.reviewChanges.length} überarbeitet
                  </span>
                )}
              </div>
              {isReviewOpen ? (
                <ChevronDown className="w-4 h-4 text-fom-grey-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-fom-grey-400" />
              )}
            </button>

            {isReviewOpen && (
              <div className="border-t border-fom-grey-100 divide-y divide-fom-grey-100">
                {result.reviewLog.map((log, i) => (
                  <div key={i} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-fom-grey-700">
                        Iteration {log.iteration} von 3
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium rounded-fom-sm px-2 py-0.5",
                          ratingClass(log.gesamtBewertung)
                        )}
                      >
                        {OUTPUT_PAGE.ratings[log.gesamtBewertung]}
                      </span>
                    </div>
                    {log.positivesHervorheben.length > 0 && (
                      <ul className="text-xs text-fom-grey-600 space-y-0.5">
                        {log.positivesHervorheben.map((p, j) => (
                          <li key={j}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {result.reviewChanges?.length > 0 && (
                  <div className="p-4 space-y-4">
                    <p className="text-xs font-medium text-fom-grey-600 uppercase tracking-wide">
                      Überarbeitete Abschnitte
                    </p>
                    {result.reviewChanges.map((change: ReviewChange, i: number) => (
                      <div key={i} className="rounded-fom-sm overflow-hidden border border-fom-grey-100 text-xs">
                        <div className="bg-fom-grey-97 px-3 py-2 flex items-center gap-2 border-b border-fom-grey-100">
                          <span className="font-mono text-fom-grey-400">{change.sectionNummer}</span>
                          <span className="font-medium text-fom-grey-700">{change.sectionTitel}</span>
                        </div>
                        <div className="bg-fom-yellow/10 border-b border-fom-yellow/30 px-3 py-2 space-y-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-fom-yellow/40 text-fom-grey-800 font-medium rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Kritik</span>
                          </div>
                          <p className="text-fom-grey-700 font-medium">{change.problem}</p>
                          <p className="text-fom-grey-600">{change.verbesserungsvorschlag}</p>
                          {change.originalPreview && (
                            <p className="text-fom-grey-400 italic mt-1 line-clamp-2">{change.originalPreview}…</p>
                          )}
                        </div>
                        <div className="bg-fom-primary-bg px-3 py-2 space-y-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="bg-fom-primary/20 text-fom-primary-darker font-medium rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide">KI-Revision</span>
                          </div>
                          {change.revisedPreview ? (
                            <p className="text-fom-grey-700 line-clamp-2">{change.revisedPreview}…</p>
                          ) : (
                            <p className="text-fom-grey-400 italic">Abschnitt wurde überarbeitet.</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Back Button */}
          <button
            onClick={() => router.push("/")}
            className="w-full border border-fom-grey-200 text-fom-grey-700 rounded-fom-sm py-3 text-sm hover:bg-fom-grey-97 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {OUTPUT_PAGE.newDocumentButton}
          </button>
        </div>
      </main>
    </div>
  );
}
