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
} from "lucide-react";
import { HEADER, OUTPUT_PAGE } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { SessionResult } from "@/lib/types";

export default function OutputPage() {
  const router = useRouter();
  const [result, setResult] = useState<SessionResult | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [quellenNames, setQuellenNames] = useState<string[]>([]);

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
    }
  }, [router]);

  async function handleDownload() {
    if (!result) return;
    setIsDownloading(true);
    try {
      const response = await fetch("/api/assemble-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentContent: result.finalDocument,
          leitfadenRules: result.leitfadenRules,
        }),
      });

      if (!response.ok) throw new Error("Download fehlgeschlagen");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Seminararbeit.docx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
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
    ? new Date(result.finalDocument.metadata.generatedAt).toLocaleDateString(
        "de-DE"
      )
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

          {/* Download Button */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full bg-fom-primary text-fom-black font-bold rounded-fom-sm py-4 text-lg hover:bg-fom-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
