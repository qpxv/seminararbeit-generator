"use client";

import { useState, useRef, useCallback } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload, X, Loader2 } from "lucide-react";
import { HEADER, FORM_PAGE } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { SessionInput } from "@/lib/types";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadZone({
  multiple,
  files,
  onFilesAdd,
  onFileRemove,
  label,
  description,
  error,
}: {
  multiple: boolean;
  files: File[];
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  label: string;
  description: string;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEvent = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(e.type === "dragover");
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf"
      );
      if (dropped.length > 0) onFilesAdd(multiple ? dropped : [dropped[0]]);
    },
    [multiple, onFilesAdd]
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files ?? []);
      if (selected.length > 0) onFilesAdd(multiple ? selected : [selected[0]]);
      e.target.value = "";
    },
    [multiple, onFilesAdd]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-fom-grey-700 mb-1">
        {label}
      </label>
      <p className="text-xs text-fom-grey-600 mb-2">{description}</p>
      <div
        className={cn(
          "border-2 border-dashed rounded-fom-sm p-6 cursor-pointer transition-colors",
          isDragOver
            ? "border-fom-primary bg-fom-primary-bg"
            : "border-fom-grey-200 hover:border-fom-primary"
        )}
        onDragOver={handleDragEvent}
        onDragLeave={handleDragEvent}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple={multiple}
          className="hidden"
          onChange={handleChange}
        />
        <div className="flex flex-col items-center gap-2 text-center pointer-events-none">
          <Upload className="w-8 h-8 text-fom-grey-400" />
          <p className="text-sm text-fom-grey-600">
            {multiple
              ? FORM_PAGE.uploadZoneTextMultiple
              : FORM_PAGE.uploadZoneText}
          </p>
        </div>
      </div>
      {files.length > 0 && (
        <ul className="mt-2 space-y-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center justify-between px-3 py-2 bg-fom-grey-97 rounded-fom-sm"
            >
              <span className="text-sm text-fom-grey-700 truncate max-w-xs">
                {file.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onFileRemove(i);
                }}
                className="ml-2 text-fom-grey-400 hover:text-fom-red shrink-0 transition-colors"
                aria-label="Datei entfernen"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-fom-red text-sm mt-1">{error}</p>}
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [forschungsfrage, setForschungsfrage] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("form_forschungsfrage") ?? "") : ""
  );
  const [gliederung, setGliederung] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("form_gliederung") ?? "") : ""
  );
  const [leitfadenFiles, setLeitfadenFiles] = useState<File[]>([]);
  const [quellenFiles, setQuellenFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!forschungsfrage.trim())
      errs.forschungsfrage = FORM_PAGE.validation.forschungsfrageRequired;
    if (!gliederung.trim())
      errs.gliederung = FORM_PAGE.validation.gliederungRequired;
    if (leitfadenFiles.length === 0)
      errs.leitfaden = FORM_PAGE.validation.leitfadenRequired;
    if (quellenFiles.length === 0)
      errs.quellen = FORM_PAGE.validation.quellenRequired;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const leitfadenBase64 = await fileToBase64(leitfadenFiles[0]);
      const quellenBase64 = await Promise.all(quellenFiles.map(fileToBase64));

      const sessionInput: SessionInput = {
        forschungsfrage: forschungsfrage.trim(),
        gliederung: gliederung.trim(),
        leitfadenFile: {
          name: leitfadenFiles[0].name,
          base64: leitfadenBase64,
        },
        quellenFiles: quellenFiles.map((f, i) => ({
          name: f.name,
          base64: quellenBase64[i],
        })),
      };

      sessionStorage.setItem("generatorInput", JSON.stringify(sessionInput));
      router.push("/generator");
    } catch (err) {
      console.error(err);
      setErrors({
        submit:
          "Fehler beim Vorbereiten der Dateien. Bitte versuche es erneut.",
      });
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-fom-grey-97 flex flex-col">
      <header className="bg-fom-primary h-16 flex items-center px-6 shrink-0 sticky top-0 z-10">
        <img
          src="/fom-logo.png"
          alt={HEADER.logoAlt}
          className="h-8 mr-4"
        />
        <span className="text-white font-medium text-base">{HEADER.appName}</span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[680px]">
          <div className="bg-white border border-fom-grey-100 rounded-fom-md shadow-sm p-8">
            <h1 className="text-2xl font-bold text-fom-black mb-1">
              {FORM_PAGE.title}
            </h1>
            <p className="text-fom-grey-600 text-sm mb-8">{FORM_PAGE.subtitle}</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-fom-grey-700 mb-1">
                  {FORM_PAGE.forschungsfrageLabel}
                </label>
                <textarea
                  rows={3}
                  value={forschungsfrage}
                  onChange={(e) => {
                    setForschungsfrage(e.target.value);
                    localStorage.setItem("form_forschungsfrage", e.target.value);
                    if (errors.forschungsfrage)
                      setErrors((p) => ({ ...p, forschungsfrage: "" }));
                  }}
                  placeholder={FORM_PAGE.forschungsfragePlaceholder}
                  className="w-full border border-fom-grey-200 rounded-fom-sm px-3 py-2 text-sm text-fom-black placeholder:text-fom-grey-400 focus:outline-none focus:border-fom-primary focus:ring-1 focus:ring-fom-primary transition-colors resize-none"
                />
                {errors.forschungsfrage && (
                  <p className="text-fom-red text-sm mt-1">
                    {errors.forschungsfrage}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-fom-grey-700 mb-1">
                  {FORM_PAGE.gliederungLabel}
                </label>
                <textarea
                  rows={6}
                  value={gliederung}
                  onChange={(e) => {
                    setGliederung(e.target.value);
                    localStorage.setItem("form_gliederung", e.target.value);
                    if (errors.gliederung)
                      setErrors((p) => ({ ...p, gliederung: "" }));
                  }}
                  placeholder={FORM_PAGE.gliederungPlaceholder}
                  className="w-full border border-fom-grey-200 rounded-fom-sm px-3 py-2 text-sm text-fom-black placeholder:text-fom-grey-400 focus:outline-none focus:border-fom-primary focus:ring-1 focus:ring-fom-primary transition-colors resize-none font-mono"
                />
                {errors.gliederung && (
                  <p className="text-fom-red text-sm mt-1">{errors.gliederung}</p>
                )}
              </div>

              <UploadZone
                multiple={false}
                files={leitfadenFiles}
                onFilesAdd={(files) => {
                  setLeitfadenFiles(files);
                  if (errors.leitfaden)
                    setErrors((p) => ({ ...p, leitfaden: "" }));
                }}
                onFileRemove={() => setLeitfadenFiles([])}
                label={FORM_PAGE.leitfadenLabel}
                description={FORM_PAGE.leitfadenDescription}
                error={errors.leitfaden}
              />

              <UploadZone
                multiple
                files={quellenFiles}
                onFilesAdd={(newFiles) => {
                  setQuellenFiles((prev) => {
                    const names = new Set(prev.map((f) => f.name));
                    return [
                      ...prev,
                      ...newFiles.filter((f) => !names.has(f.name)),
                    ];
                  });
                  if (errors.quellen)
                    setErrors((p) => ({ ...p, quellen: "" }));
                }}
                onFileRemove={(i) =>
                  setQuellenFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
                label={FORM_PAGE.quellenLabel}
                description={FORM_PAGE.quellenDescription}
                error={errors.quellen}
              />

              {errors.submit && (
                <p className="text-fom-red text-sm">{errors.submit}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-fom-primary text-fom-black font-bold rounded-fom-sm py-3 text-base hover:bg-fom-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {FORM_PAGE.submittingText}
                  </>
                ) : (
                  FORM_PAGE.submitButton
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
